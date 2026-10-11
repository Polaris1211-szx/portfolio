"""Core logic for the production-oriented DTD input-data pipeline.

The module keeps the assignment workbook schema unchanged while adding one
new trading-day input per daily run. Market prices and HKMA reference data are
requested automatically, with local assessment snapshots used only after the
corresponding live request has failed three times.
"""

from datetime import date, timedelta
from pathlib import Path
import time

import pandas as pd
import requests


# =============================================================================
# Project paths
# =============================================================================

ROOT = Path(__file__).resolve().parents[1]

RAW_EXCEL = ROOT / "data/raw/vanke_original.xlsx"
OUTPUT_EXCEL = ROOT / "data/output/vanke_updated.xlsx"
INPUT_CSV_OUTPUT = ROOT / "data/output/vanke_updated_input.csv"
REPLAY_OUTPUT_DIR = ROOT / "data/output/replay"

MARKET_DATA_FALLBACK_FILE = (
    ROOT / "data/reference/market_data_fallback.csv"
)

RISK_FREE_RATE_FILE = (
    ROOT / "data/reference/risk_free_rate.csv"
)
RISK_FREE_RATE_FALLBACK_FILE = (
    ROOT / "data/reference/risk_free_rate_fallback.csv"
)

FX_RATE_FILE = (
    ROOT / "data/reference/cny_hkd_rates.csv"
)
FX_RATE_FALLBACK_FILE = (
    ROOT / "data/reference/cny_hkd_rates_fallback.csv"
)


# =============================================================================
# Assignment assumptions and data contract
# =============================================================================

COMPANY_NUMBER = 5338

# Vanke share counts used for the assessment period.
A_SHARE_COUNT = 9_724_196_533
H_SHARE_COUNT = 2_206_512_938

PROJECT_START_DATE = date(2025, 12, 15)
PROJECT_END_DATE = date(2026, 1, 30)

INPUT_COLUMNS = [
    "Comp_no",
    "Date",
    "CUR_MKT_CAP(HKD)",
    "BS_CUR_LIAB(HKD)",
    "BS_LT_BORROW(HKD)",
    "BS_TOT_LIAB2(HKD)",
    "BS_TOT_ASSET(HKD)",
    "Risk_Free_Rate",
]

BALANCE_SHEET_COLUMNS = [
    "BS_CUR_LIAB(HKD)",
    "BS_LT_BORROW(HKD)",
    "BS_TOT_LIAB2(HKD)",
    "BS_TOT_ASSET(HKD)",
]


# =============================================================================
# External APIs
# =============================================================================

TENCENT_KLINE_API = (
    "https://web.ifzq.gtimg.cn/appstock/app/kline/kline"
)

TENCENT_SYMBOLS = {
    "A_Close": "sz000002",
    "H_Close": "hk02202",
}

HKMA_RISK_FREE_API = (
    "https://api.hkma.gov.hk/public/"
    "market-data-and-statistics/monthly-statistical-bulletin/"
    "efbn/efbn-yield-daily"
)

HKMA_FX_API = (
    "https://api.hkma.gov.hk/public/"
    "market-data-and-statistics/monthly-statistical-bulletin/"
    "er-ir/er-eeri-daily"
)

MAX_API_ATTEMPTS = 3
REQUEST_TIMEOUT = (10, 60)


# =============================================================================
# General utilities
# =============================================================================

def date_to_int(value):
    """Convert a date-like value to the workbook YYYYMMDD integer format."""

    return int(pd.Timestamp(value).strftime("%Y%m%d"))


def int_to_date(value):
    """Convert a workbook YYYYMMDD value to a Python date."""

    return pd.to_datetime(
        str(int(value)),
        format="%Y%m%d",
    ).date()


def validate_project_date(value, label):
    """Reject dates outside the assessment demonstration horizon."""

    if value < PROJECT_START_DATE or value > PROJECT_END_DATE:
        raise ValueError(
            f"{label} must be between "
            f"{PROJECT_START_DATE} and {PROJECT_END_DATE}."
        )


def request_json_with_retries(url, params, source_name):
    """Request JSON data and retry the same request up to three times."""

    last_error = None

    for attempt in range(1, MAX_API_ATTEMPTS + 1):
        print(
            f"{source_name} API attempt "
            f"{attempt}/{MAX_API_ATTEMPTS}"
        )

        try:
            response = requests.get(
                url,
                params=params,
                timeout=REQUEST_TIMEOUT,
            )
            response.raise_for_status()
            return response.json()

        except (
            requests.RequestException,
            ValueError,
        ) as error:
            last_error = error
            print(
                f"{source_name} request failed on attempt "
                f"{attempt}: {error}"
            )

            if attempt < MAX_API_ATTEMPTS:
                time.sleep(2 * attempt)

    raise RuntimeError(
        f"{source_name} API unavailable after "
        f"{MAX_API_ATTEMPTS} attempts."
    ) from last_error


# =============================================================================
# Workbook loading and validation
# =============================================================================

def read_workbook():
    """Load the current official pipeline state or the original workbook."""

    if OUTPUT_EXCEL.exists():
        source_file = OUTPUT_EXCEL
        print("Loading existing pipeline output.")
    else:
        source_file = RAW_EXCEL
        print("Loading original workbook.")

    input_df = pd.read_excel(
        source_file,
        sheet_name="Input",
    )
    output_df = pd.read_excel(
        source_file,
        sheet_name="Output",
    )

    return input_df, output_df


def validate_updated_state(updated_input, output_df):
    """Run consistency checks before writing the official output files."""

    if list(updated_input.columns) != INPUT_COLUMNS:
        raise ValueError("The Input schema has changed.")

    if updated_input.empty:
        raise ValueError("The updated Input data is empty.")

    if updated_input["Date"].duplicated().any():
        raise ValueError("Duplicate Input dates were detected.")

    if not updated_input["Date"].is_monotonic_increasing:
        raise ValueError("Input dates are not in ascending order.")

    if updated_input[INPUT_COLUMNS].isna().any().any():
        raise ValueError("Missing values were detected in Input data.")

    if set(updated_input["Comp_no"].unique()) != {COMPANY_NUMBER}:
        raise ValueError("Unexpected company numbers were detected.")

    original_input = pd.read_excel(
        RAW_EXCEL,
        sheet_name="Input",
    )
    original_output = pd.read_excel(
        RAW_EXCEL,
        sheet_name="Output",
    )

    historical_input = updated_input.iloc[
        : len(original_input)
    ].reset_index(drop=True)

    pd.testing.assert_frame_equal(
        historical_input,
        original_input,
        check_dtype=False,
        check_exact=False,
        rtol=1e-10,
        atol=1e-8,
    )

    pd.testing.assert_frame_equal(
        output_df.reset_index(drop=True),
        original_output.reset_index(drop=True),
        check_dtype=False,
        check_exact=False,
        rtol=1e-10,
        atol=1e-8,
    )


# =============================================================================
# Market-price ingestion
# =============================================================================

def parse_tencent_symbol(payload, symbol, close_column):
    """Extract daily close prices for one Tencent market symbol."""

    symbol_data = (
        payload
        .get("data", {})
        .get(symbol, {})
    )

    rows = []

    for key in ("day", "qfqday", "hfqday"):
        candidate = symbol_data.get(key)

        if isinstance(candidate, list):
            rows = candidate
            break

    parsed = []

    for row in rows:
        if not isinstance(row, list) or len(row) < 3:
            continue

        parsed.append(
            {
                "Date": pd.to_datetime(
                    row[0],
                    errors="coerce",
                ),
                close_column: pd.to_numeric(
                    row[2],
                    errors="coerce",
                ),
            }
        )

    if not parsed:
        return pd.DataFrame(
            columns=["Date", close_column]
        )

    result = pd.DataFrame(parsed).dropna(
        subset=["Date", close_column]
    )

    result["Date"] = (
        result["Date"]
        .dt.strftime("%Y%m%d")
        .astype(int)
    )

    return result.drop_duplicates(
        subset=["Date"],
        keep="last",
    )


def fetch_live_market_data(start_date, end_date):
    """Fetch A-share and H-share closing prices from Tencent JSON data."""

    frames = []

    for close_column, symbol in TENCENT_SYMBOLS.items():
        params = {
            "param": (
                f"{symbol},day,"
                f"{start_date:%Y-%m-%d},"
                f"{end_date:%Y-%m-%d},"
                "320,qfq"
            )
        }

        payload = request_json_with_retries(
            TENCENT_KLINE_API,
            params,
            f"Tencent {symbol}",
        )

        frames.append(
            parse_tencent_symbol(
                payload,
                symbol,
                close_column,
            )
        )

    market_data = frames[0].merge(
        frames[1],
        on="Date",
        how="outer",
    )

    if market_data.empty:
        raise RuntimeError(
            "Tencent returned no market records for the requested range."
        )

    return market_data.sort_values("Date")


def load_market_fallback():
    """Read and standardise the local A/H closing-price fallback snapshot."""

    if not MARKET_DATA_FALLBACK_FILE.exists():
        raise FileNotFoundError(
            "Market-data fallback file was not found: "
            f"{MARKET_DATA_FALLBACK_FILE}"
        )

    fallback = pd.read_csv(
        MARKET_DATA_FALLBACK_FILE
    )

    required = {"Date", "A_Close", "H_Close"}
    missing = required.difference(fallback.columns)

    if missing:
        raise ValueError(
            "Market-data fallback is missing columns: "
            f"{sorted(missing)}"
        )

    date_text = (
        fallback["Date"]
        .astype(str)
        .str.replace(".0", "", regex=False)
        .str.replace("-", "", regex=False)
    )

    fallback["Date"] = pd.to_numeric(
        date_text,
        errors="coerce",
    )

    fallback["A_Close"] = pd.to_numeric(
        fallback["A_Close"],
        errors="coerce",
    )

    fallback["H_Close"] = pd.to_numeric(
        fallback["H_Close"],
        errors="coerce",
    )

    fallback = fallback.dropna(
        subset=["Date"]
    )

    fallback["Date"] = fallback["Date"].astype(int)

    return (
        fallback[
            ["Date", "A_Close", "H_Close"]
        ]
        .drop_duplicates(subset=["Date"], keep="last")
        .sort_values("Date")
    )


def combine_market_sources(live_data, fallback_data):
    """Use live values first and fallback values only where live data is absent."""

    fallback_indexed = fallback_data.set_index("Date")
    live_indexed = live_data.set_index("Date")

    all_dates = fallback_indexed.index.union(
        live_indexed.index
    )

    combined = fallback_indexed.reindex(all_dates)

    for column in ("A_Close", "H_Close"):
        if column in live_indexed.columns:
            live_values = live_indexed[column]

            combined.loc[
                live_values.dropna().index,
                column,
            ] = live_values.dropna()

    return combined.reset_index().sort_values("Date")


def load_market_data(start_date, end_date):
    """Load live market prices, falling back after three failed API attempts."""

    lookback_start = max(
        PROJECT_START_DATE,
        start_date - timedelta(days=14),
    )

    try:
        live_data = fetch_live_market_data(
            lookback_start,
            end_date,
        )

        print("Using live Tencent A/H market data.")

        try:
            fallback_data = load_market_fallback()

            market_data = combine_market_sources(
                live_data,
                fallback_data,
            )

        except (FileNotFoundError, ValueError):
            market_data = live_data

    except RuntimeError as error:
        print(error)
        print("Using local A/H market-data fallback.")

        market_data = load_market_fallback()

    start_int = date_to_int(lookback_start)
    end_int = date_to_int(end_date)

    market_data = market_data[
        (market_data["Date"] >= start_int)
        & (market_data["Date"] <= end_int)
    ].copy()

    # A date is valid if at least one of the two securities traded.
    market_data["Is_Trading_Day"] = market_data[
        ["A_Close", "H_Close"]
    ].notna().any(axis=1)

    # When one exchange is closed, preserve the other security's latest close.
    market_data = market_data.sort_values("Date")

    market_data[["A_Close", "H_Close"]] = (
        market_data[["A_Close", "H_Close"]]
        .ffill()
    )

    market_data = market_data[
        market_data["Is_Trading_Day"]
    ].copy()

    return market_data[
        [
            "Date",
            "A_Close",
            "H_Close",
            "Is_Trading_Day",
        ]
    ]


# =============================================================================
# Reference-series utilities
# =============================================================================

def read_reference_file(file_path, value_column):
    """Read and standardise a two-column reference-data CSV."""

    if not file_path.exists():
        return pd.DataFrame(
            columns=["Date", value_column]
        )

    data = pd.read_csv(file_path)

    required = {"Date", value_column}
    missing = required.difference(data.columns)

    if missing:
        raise ValueError(
            f"{file_path.name} is missing columns: "
            f"{sorted(missing)}"
        )

    date_text = (
        data["Date"]
        .astype(str)
        .str.replace(".0", "", regex=False)
        .str.replace("-", "", regex=False)
    )

    data["Date"] = pd.to_numeric(
        date_text,
        errors="coerce",
    )

    data[value_column] = pd.to_numeric(
        data[value_column],
        errors="coerce",
    )

    data = data.dropna(
        subset=["Date", value_column]
    )

    data["Date"] = data["Date"].astype(int)

    return (
        data[["Date", value_column]]
        .drop_duplicates(subset=["Date"], keep="last")
        .sort_values("Date")
        .reset_index(drop=True)
    )


def trim_to_as_of_date(data, target_end_date):
    """Prevent future reference values from leaking into a simulated run."""

    if data.empty:
        return data.copy()

    return data[
        data["Date"] <= date_to_int(target_end_date)
    ].copy()


def combine_reference_data(existing, new_data, value_column):
    """Append reference records, keeping the latest value per date."""

    return (
        pd.concat(
            [existing, new_data],
            ignore_index=True,
        )
        .drop_duplicates(subset=["Date"], keep="last")
        .dropna(subset=["Date", value_column])
        .sort_values("Date")
        .reset_index(drop=True)
    )


def select_fallback_range(
    fallback_file,
    value_column,
    start_date,
    end_date,
):
    """Select a requested date range from a local fallback snapshot."""

    fallback = read_reference_file(
        fallback_file,
        value_column,
    )

    start_int = date_to_int(start_date)
    end_int = date_to_int(end_date)

    return fallback[
        (fallback["Date"] >= start_int)
        & (fallback["Date"] <= end_int)
    ].copy()


# =============================================================================
# Risk-free-rate ingestion
# =============================================================================

def parse_risk_free_payload(payload):
    """Convert HKMA 12-month Exchange Fund Bills yields to project format."""

    header = payload.get("header", {})

    if header.get("success") is False:
        raise RuntimeError(
            f"HKMA risk-free API returned an error: {header}"
        )

    records = (
        payload
        .get("result", {})
        .get("records", [])
    )

    if not records:
        return pd.DataFrame(
            columns=["Date", "Risk_Free_Rate"]
        )

    raw = pd.DataFrame(records)
    required = {"end_of_day", "efb_364d"}

    if not required.issubset(raw.columns):
        raise RuntimeError(
            "HKMA risk-free response is missing required fields."
        )

    result = pd.DataFrame()

    result["Date"] = pd.to_datetime(
        raw["end_of_day"],
        errors="coerce",
    ).dt.strftime("%Y%m%d")

    result["Risk_Free_Rate"] = pd.to_numeric(
        raw["efb_364d"],
        errors="coerce",
    )

    result = result.dropna(
        subset=["Date", "Risk_Free_Rate"]
    )

    result["Date"] = result["Date"].astype(int)

    return result


def update_risk_free_rates(target_end_date, persist=True):
    """Update 12-month HKMA risk-free rates with retry and fallback logic."""

    rates = read_reference_file(
        RISK_FREE_RATE_FILE,
        "Risk_Free_Rate",
    )

    rates = trim_to_as_of_date(
        rates,
        target_end_date,
    )

    if rates.empty:
        start_date = PROJECT_START_DATE
    else:
        start_date = (
            int_to_date(rates["Date"].max())
            + timedelta(days=1)
        )

    if start_date <= target_end_date:
        params = {
            "choose": "end_of_day",
            "from": start_date.strftime("%Y-%m-%d"),
            "to": target_end_date.strftime("%Y-%m-%d"),
            "pagesize": 1000,
        }

        try:
            payload = request_json_with_retries(
                HKMA_RISK_FREE_API,
                params,
                "HKMA risk-free-rate",
            )

            new_rates = parse_risk_free_payload(payload)

            print("Using live HKMA risk-free-rate data.")

        except RuntimeError as error:
            print(error)
            print("Using local risk-free-rate fallback.")

            new_rates = select_fallback_range(
                RISK_FREE_RATE_FALLBACK_FILE,
                "Risk_Free_Rate",
                start_date,
                target_end_date,
            )

        rates = combine_reference_data(
            rates,
            new_rates,
            "Risk_Free_Rate",
        )

    else:
        print(
            "Risk-free-rate data already covers",
            target_end_date,
        )

    if rates.empty:
        raise RuntimeError(
            "No risk-free-rate data is available."
        )

    if persist:
        RISK_FREE_RATE_FILE.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        rates.to_csv(
            RISK_FREE_RATE_FILE,
            index=False,
        )

    return rates


# =============================================================================
# CNY/HKD exchange-rate ingestion
# =============================================================================

def parse_fx_payload(payload):
    """Convert HKMA direct CNY/HKD rates to project format."""

    header = payload.get("header", {})

    if header.get("success") is False:
        raise RuntimeError(
            f"HKMA FX API returned an error: {header}"
        )

    records = (
        payload
        .get("result", {})
        .get("records", [])
    )

    if not records:
        return pd.DataFrame(
            columns=["Date", "CNY_HKD"]
        )

    raw = pd.DataFrame(records)
    required = {"end_of_day", "cny"}

    if not required.issubset(raw.columns):
        raise RuntimeError(
            "HKMA FX response is missing required fields."
        )

    result = pd.DataFrame()

    result["Date"] = pd.to_datetime(
        raw["end_of_day"],
        errors="coerce",
    ).dt.strftime("%Y%m%d")

    result["CNY_HKD"] = pd.to_numeric(
        raw["cny"],
        errors="coerce",
    )

    result = result.dropna(
        subset=["Date", "CNY_HKD"]
    )

    result["Date"] = result["Date"].astype(int)

    return result


def update_fx_rates(target_end_date, persist=True):
    """Update direct CNY/HKD rates with three retries and local fallback."""

    rates = read_reference_file(
        FX_RATE_FILE,
        "CNY_HKD",
    )

    rates = trim_to_as_of_date(
        rates,
        target_end_date,
    )

    if rates.empty:
        start_date = PROJECT_START_DATE
    else:
        start_date = (
            int_to_date(rates["Date"].max())
            + timedelta(days=1)
        )

    if start_date <= target_end_date:
        params = {
            "choose": "end_of_day",
            "from": start_date.strftime("%Y-%m-%d"),
            "to": target_end_date.strftime("%Y-%m-%d"),
            "pagesize": 100,
            "offset": 0,
            "sortorder": "asc",
        }

        try:
            payload = request_json_with_retries(
                HKMA_FX_API,
                params,
                "HKMA CNY/HKD",
            )

            new_rates = parse_fx_payload(payload)

            print("Using live HKMA CNY/HKD data.")

        except RuntimeError as error:
            print(error)
            print("Using local CNY/HKD fallback.")

            new_rates = select_fallback_range(
                FX_RATE_FALLBACK_FILE,
                "CNY_HKD",
                start_date,
                target_end_date,
            )

        rates = combine_reference_data(
            rates,
            new_rates,
            "CNY_HKD",
        )

    else:
        print(
            "CNY/HKD data already covers",
            target_end_date,
        )

    if rates.empty:
        raise RuntimeError(
            "No CNY/HKD data is available."
        )

    if persist:
        FX_RATE_FILE.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        rates.to_csv(
            FX_RATE_FILE,
            index=False,
        )

    return rates


# =============================================================================
# Transformation and row construction
# =============================================================================

def attach_previous_available_value(
    rows,
    reference_data,
    value_column,
):
    """Attach the latest reference value available on or before each date."""

    left = rows.copy().sort_values("Date")
    right = reference_data.copy().sort_values("Date")

    left["_merge_date"] = pd.to_datetime(
        left["Date"].astype(str),
        format="%Y%m%d",
    )

    right["_merge_date"] = pd.to_datetime(
        right["Date"].astype(str),
        format="%Y%m%d",
    )

    right = right[
        ["_merge_date", value_column]
    ].dropna()

    merged = pd.merge_asof(
        left.sort_values("_merge_date"),
        right.sort_values("_merge_date"),
        on="_merge_date",
        direction="backward",
    )

    return merged.drop(columns=["_merge_date"])


def create_new_rows(
    current_input,
    market_data,
    risk_free_rates,
    fx_rates,
    start_date,
    end_date,
    daily_mode=False,
):
    """Construct new DTD Input rows without changing historical records."""

    latest_processed_date = int(
        current_input["Date"].max()
    )

    start_int = date_to_int(start_date)
    end_int = date_to_int(end_date)

    new_market_data = market_data[
        (market_data["Date"] > latest_processed_date)
        & (market_data["Date"] >= start_int)
        & (market_data["Date"] <= end_int)
    ].copy()

    new_market_data = new_market_data.sort_values(
        "Date"
    )

    if daily_mode:
        new_market_data = new_market_data.head(1)

    if new_market_data.empty:
        print("No new market records found.")

        return pd.DataFrame(columns=INPUT_COLUMNS)

    if new_market_data[
        ["A_Close", "H_Close"]
    ].isna().any().any():
        raise ValueError(
            "A/H closing prices could not be carried forward."
        )

    new_rows = attach_previous_available_value(
        new_market_data,
        fx_rates,
        "CNY_HKD",
    )

    new_rows = attach_previous_available_value(
        new_rows,
        risk_free_rates,
        "Risk_Free_Rate",
    )

    if new_rows[
        ["CNY_HKD", "Risk_Free_Rate"]
    ].isna().any().any():
        raise ValueError(
            "Reference data is unavailable for one or more new dates."
        )

    # The workbook scale is HKD millions.
    new_rows["A_MKT_CAP_HKD"] = (
        new_rows["A_Close"]
        * A_SHARE_COUNT
        * new_rows["CNY_HKD"]
        / 1_000_000
    )

    new_rows["H_MKT_CAP_HKD"] = (
        new_rows["H_Close"]
        * H_SHARE_COUNT
        / 1_000_000
    )

    new_rows["CUR_MKT_CAP(HKD)"] = (
        new_rows["A_MKT_CAP_HKD"]
        + new_rows["H_MKT_CAP_HKD"]
    ).round(6)

    last_historical_row = (
        current_input
        .sort_values("Date")
        .iloc[-1]
    )

    for column in BALANCE_SHEET_COLUMNS:
        new_rows[column] = last_historical_row[column]

    new_rows["Comp_no"] = COMPANY_NUMBER

    print("Calculated market-cap components:")

    print(
        new_rows[
            [
                "Date",
                "A_Close",
                "H_Close",
                "CNY_HKD",
                "A_MKT_CAP_HKD",
                "H_MKT_CAP_HKD",
                "CUR_MKT_CAP(HKD)",
            ]
        ].to_string(index=False)
    )

    return new_rows[
        INPUT_COLUMNS
    ].sort_values("Date")


# =============================================================================
# Output generation
# =============================================================================

def save_workbook(updated_input, output_df):
    """Write the official Excel workbook and review-friendly Input CSV."""

    updated_input = updated_input[
        INPUT_COLUMNS
    ].sort_values("Date").reset_index(drop=True)

    validate_updated_state(
        updated_input,
        output_df,
    )

    OUTPUT_EXCEL.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    updated_input.to_csv(
        INPUT_CSV_OUTPUT,
        index=False,
    )

    with pd.ExcelWriter(
        OUTPUT_EXCEL,
        engine="openpyxl",
    ) as writer:
        updated_input.to_excel(
            writer,
            sheet_name="Input",
            index=False,
        )

        output_df.to_excel(
            writer,
            sheet_name="Output",
            index=False,
        )

    print("Saved Excel:", OUTPUT_EXCEL)
    print("Saved Input CSV:", INPUT_CSV_OUTPUT)


# =============================================================================
# Daily incremental mode
# =============================================================================

def run_daily(run_date):
    """Process only the next unprocessed trading day up to the run date."""

    validate_project_date(
        run_date,
        "Simulated run date",
    )

    current_input, output_df = read_workbook()

    latest_processed_date = int(
        current_input["Date"].max()
    )

    latest_processed = int_to_date(
        latest_processed_date
    )

    if latest_processed >= run_date:
        print(
            "No unprocessed date is available up to",
            run_date,
        )
        return

    market_data = load_market_data(
        latest_processed + timedelta(days=1),
        run_date,
    )

    eligible = market_data[
        (market_data["Date"] > latest_processed_date)
        & (market_data["Date"] <= date_to_int(run_date))
    ].sort_values("Date")

    if eligible.empty:
        print(
            "No trading day is available up to",
            run_date,
        )
        return

    next_date = int_to_date(
        eligible.iloc[0]["Date"]
    )

    print("Next unprocessed trading date:", next_date)

    risk_free_rates = update_risk_free_rates(
        next_date,
        persist=True,
    )

    fx_rates = update_fx_rates(
        next_date,
        persist=True,
    )

    new_rows = create_new_rows(
        current_input=current_input,
        market_data=market_data,
        risk_free_rates=risk_free_rates,
        fx_rates=fx_rates,
        start_date=next_date,
        end_date=next_date,
        daily_mode=True,
    )

    if new_rows.empty:
        print("No official output was written.")
        return

    updated_input = pd.concat(
        [current_input, new_rows],
        ignore_index=True,
    )

    save_workbook(
        updated_input,
        output_df,
    )

    print("\nDaily pipeline completed.")
    print("Simulated run date:", run_date)
    print("New rows:", len(new_rows))
    print("Final rows:", len(updated_input))
    print("Final date:", updated_input["Date"].max())


# =============================================================================
# Read-only replay mode
# =============================================================================

def run_replay(start_date, end_date):
    """Generate a date-range preview without modifying official output files."""

    validate_project_date(
        start_date,
        "Replay start date",
    )

    validate_project_date(
        end_date,
        "Replay end date",
    )

    if start_date > end_date:
        raise ValueError(
            "Start date cannot be later than end date."
        )

    original_input = pd.read_excel(
        RAW_EXCEL,
        sheet_name="Input",
    )

    market_data = load_market_data(
        start_date,
        end_date,
    )

    risk_free_rates = update_risk_free_rates(
        end_date,
        persist=False,
    )

    fx_rates = update_fx_rates(
        end_date,
        persist=False,
    )

    preview_rows = create_new_rows(
        current_input=original_input,
        market_data=market_data,
        risk_free_rates=risk_free_rates,
        fx_rates=fx_rates,
        start_date=start_date,
        end_date=end_date,
        daily_mode=False,
    )

    REPLAY_OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    preview_file = REPLAY_OUTPUT_DIR / (
        "replay_preview_"
        f"{start_date:%Y%m%d}_"
        f"{end_date:%Y%m%d}.csv"
    )

    preview_rows.to_csv(
        preview_file,
        index=False,
    )

    print("\nReplay validation completed.")
    print("Replay range:", start_date, "to", end_date)
    print("Preview rows:", len(preview_rows))

    if preview_rows.empty:
        print("Preview first date: None")
        print("Preview last date: None")
    else:
        print(
            "Preview first date:",
            preview_rows["Date"].min(),
        )

        print(
            "Preview last date:",
            preview_rows["Date"].max(),
        )

    print("Preview file:", preview_file)
    print("Official output was not modified.")