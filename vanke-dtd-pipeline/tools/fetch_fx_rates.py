from pathlib import Path
from datetime import datetime
import argparse
import time

import pandas as pd
import requests


# Project root directory
ROOT = Path(__file__).resolve().parents[1]

# Official HKMA daily exchange-rate API
HKMA_API = (
    "https://api.hkma.gov.hk/public/"
    "market-data-and-statistics/monthly-statistical-bulletin/"
    "er-ir/er-eeri-daily"
)

# Default project period
DEFAULT_START_DATE = "2025-12-15"
DEFAULT_END_DATE = "2026-01-30"

# Main exchange-rate file used by the pipeline
OUTPUT_FILE = (
    ROOT / "data" / "reference" / "cny_hkd_rates.csv"
)

# Fallback file used when the API is unavailable
FALLBACK_FILE = (
    ROOT / "data" / "reference" / "cny_hkd_rates_fallback.csv"
)

# Maximum number of API attempts
MAX_ATTEMPTS = 3


def parse_arguments() -> argparse.Namespace:
    """
    Read optional date parameters from the command line.
    """

    parser = argparse.ArgumentParser(
        description="Fetch daily CNY/HKD exchange rates from HKMA."
    )

    parser.add_argument(
        "--start-date",
        default=DEFAULT_START_DATE,
        help="Start date in YYYY-MM-DD format.",
    )

    parser.add_argument(
        "--end-date",
        default=DEFAULT_END_DATE,
        help="End date in YYYY-MM-DD format.",
    )

    return parser.parse_args()


def validate_date_range(
    start_date: str,
    end_date: str,
) -> None:
    """
    Validate the requested date range.
    """

    start = datetime.strptime(
        start_date,
        "%Y-%m-%d",
    )

    end = datetime.strptime(
        end_date,
        "%Y-%m-%d",
    )

    if start > end:
        raise ValueError(
            "Start date cannot be later than end date."
        )


def fetch_from_hkma(
    start_date: str,
    end_date: str,
) -> dict:
    """
    Fetch CNY/HKD exchange rates from the official HKMA API.

    The HKMA 'cny' field represents HKD per unit of CNY.
    """

    # The 'choose' parameter tells HKMA to filter by end_of_day.
    # The API uses 'from' and 'to' for the date range.
    params = {
        "choose": "end_of_day",
        "from": start_date,
        "to": end_date,
        "pagesize": 100,
        "offset": 0,
        "sortorder": "asc",
    }

    last_error = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        print(
            f"HKMA FX API attempt "
            f"{attempt}/{MAX_ATTEMPTS}"
        )

        try:
            response = requests.get(
                HKMA_API,
                params=params,
                timeout=(10, 60),
            )

            if response.status_code != 200:
                print(
                    "HKMA response status:",
                    response.status_code,
                )
                print(
                    "HKMA response body:",
                    response.text[:1000],
                )

            response.raise_for_status()

            payload = response.json()

            header = payload.get("header", {})

            if header.get("success") is False:
                raise RuntimeError(
                    "HKMA returned an unsuccessful response: "
                    f"{header}"
                )

            print("HKMA FX API request succeeded.")
            return payload

        except (
            requests.RequestException,
            ValueError,
            RuntimeError,
        ) as error:
            last_error = error

            print(
                f"HKMA request failed on attempt "
                f"{attempt}: {error}"
            )

            if attempt < MAX_ATTEMPTS:
                time.sleep(2)

    raise RuntimeError(
        "HKMA FX API unavailable after three attempts."
    ) from last_error


def extract_records(payload: dict) -> list:
    """
    Extract records from the HKMA JSON response.
    """

    result = payload.get("result", {})

    if not isinstance(result, dict):
        return []

    records = result.get("records", [])

    if isinstance(records, list):
        return records

    return []


def convert_records_to_dataframe(
    records: list,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """
    Convert HKMA records into the project format:

    Date,CNY_HKD
    """

    if not records:
        raise RuntimeError(
            "HKMA returned no exchange-rate records."
        )

    raw = pd.DataFrame(records)

    required_columns = {
        "end_of_day",
        "cny",
    }

    missing_columns = required_columns.difference(
        raw.columns
    )

    if missing_columns:
        raise RuntimeError(
            "Missing required HKMA columns: "
            f"{sorted(missing_columns)}"
        )

    output = pd.DataFrame()

    # Convert dates to YYYYMMDD format
    output["Date"] = pd.to_datetime(
        raw["end_of_day"],
        errors="coerce",
    ).dt.strftime("%Y%m%d")

    # Convert the direct HKD-per-CNY rate to numeric format
    output["CNY_HKD"] = pd.to_numeric(
        raw["cny"],
        errors="coerce",
    )

    # Remove invalid records
    output = output.dropna(
        subset=["Date", "CNY_HKD"]
    )

    start_key = datetime.strptime(
        start_date,
        "%Y-%m-%d",
    ).strftime("%Y%m%d")

    end_key = datetime.strptime(
        end_date,
        "%Y-%m-%d",
    ).strftime("%Y%m%d")

    # Keep only records inside the requested date range
    output = output[
        (output["Date"] >= start_key)
        & (output["Date"] <= end_key)
    ]

    # Remove duplicate dates and sort chronologically
    output = (
        output
        .drop_duplicates(subset=["Date"])
        .sort_values("Date")
        .reset_index(drop=True)
    )

    if output.empty:
        raise RuntimeError(
            "No valid CNY/HKD records remained after processing."
        )

    return output


def load_fallback_file(
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """
    Load the local fallback exchange-rate file.
    """

    if not FALLBACK_FILE.exists():
        raise FileNotFoundError(
            "HKMA API failed and the fallback file was not found: "
            f"{FALLBACK_FILE}"
        )

    fallback = pd.read_csv(
        FALLBACK_FILE,
        dtype={"Date": str},
    )

    required_columns = {
        "Date",
        "CNY_HKD",
    }

    missing_columns = required_columns.difference(
        fallback.columns
    )

    if missing_columns:
        raise ValueError(
            "Fallback file is missing columns: "
            f"{sorted(missing_columns)}"
        )

    fallback["Date"] = (
        fallback["Date"]
        .astype(str)
        .str.replace("-", "", regex=False)
    )

    fallback["CNY_HKD"] = pd.to_numeric(
        fallback["CNY_HKD"],
        errors="coerce",
    )

    fallback = fallback.dropna(
        subset=["Date", "CNY_HKD"]
    )

    start_key = datetime.strptime(
        start_date,
        "%Y-%m-%d",
    ).strftime("%Y%m%d")

    end_key = datetime.strptime(
        end_date,
        "%Y-%m-%d",
    ).strftime("%Y%m%d")

    fallback = fallback[
        (fallback["Date"] >= start_key)
        & (fallback["Date"] <= end_key)
    ]

    fallback = (
        fallback
        .drop_duplicates(subset=["Date"])
        .sort_values("Date")
        .reset_index(drop=True)
    )

    if fallback.empty:
        raise RuntimeError(
            "The fallback file contains no data for the "
            "requested date range."
        )

    return fallback


def save_rates(
    rates: pd.DataFrame,
) -> None:
    """
    Save processed exchange rates to the main reference file.
    """

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    rates.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print("Saved exchange-rate file:")
    print(OUTPUT_FILE)


def main() -> None:
    args = parse_arguments()

    start_date = args.start_date
    end_date = args.end_date

    validate_date_range(
        start_date,
        end_date,
    )

    print(
        f"Fetching CNY/HKD rates from "
        f"{start_date} to {end_date}..."
    )

    try:
        payload = fetch_from_hkma(
            start_date,
            end_date,
        )

        records = extract_records(payload)

        rates = convert_records_to_dataframe(
            records,
            start_date,
            end_date,
        )

        print("Using live HKMA API data.")

    except Exception as error:
        print()
        print("HKMA API failed after three attempts.")
        print("Reason:", error)
        print("Using local fallback exchange-rate data.")

        rates = load_fallback_file(
            start_date,
            end_date,
        )

    save_rates(rates)

    print()
    print("Number of rows:", len(rates))

    print()
    print("First rows:")
    print(rates.head().to_string(index=False))

    print()
    print("Last rows:")
    print(rates.tail().to_string(index=False))


if __name__ == "__main__":
    main()