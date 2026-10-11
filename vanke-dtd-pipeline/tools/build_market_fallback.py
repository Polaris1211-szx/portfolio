"""
Build a local A-share and H-share market-data snapshot.

This file is used only to create the deterministic fallback dataset
for the assessment demonstration.

The daily pipeline will try the live API first. The local CSV is used
only when the live API is unavailable.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import requests


ROOT = Path(__file__).resolve().parents[1]

OUTPUT_FILE = (
    ROOT
    / "data"
    / "reference"
    / "market_data_fallback.csv"
)

API_URL = (
    "https://web.ifzq.gtimg.cn/appstock/app/kline/kline"
)

START_DATE = "2025-12-15"
END_DATE = "2026-01-30"

REQUEST_TIMEOUT = 20


MARKETS = {
    "A_Close": "sz000002",
    "H_Close": "hk02202",
}


def fetch_market_history(
    symbol: str,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """Fetch daily OHLCV history for one market."""

    params = {
        "param": (
            f"{symbol},day,"
            f"{start_date},{end_date},100"
        )
    }

    response = requests.get(
        API_URL,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    payload = response.json()

    if payload.get("code") != 0:
        raise RuntimeError(
            f"Unexpected API response for {symbol}: {payload}"
        )

    market_data = payload.get("data", {}).get(symbol, {})
    rows = market_data.get("day", [])

    if not rows:
        raise RuntimeError(
            f"No historical data returned for {symbol}."
        )

    records = []

    for row in rows:
        if len(row) < 6:
            continue

        records.append(
            {
                "Date": row[0].replace("-", ""),
                "Open": float(row[1]),
                "Close": float(row[2]),
                "High": float(row[3]),
                "Low": float(row[4]),
                "Volume": float(row[5]),
            }
        )

    result = pd.DataFrame(records)

    if result.empty:
        raise RuntimeError(
            f"No valid rows returned for {symbol}."
        )

    return result


def build_fallback() -> None:
    """Fetch both markets and save one combined fallback CSV."""

    print(
        "Building A-share and H-share market-data fallback..."
    )

    market_frames = []

    for output_column, symbol in MARKETS.items():
        print(f"Fetching {symbol}...")

        market_df = fetch_market_history(
            symbol=symbol,
            start_date=START_DATE,
            end_date=END_DATE,
        )

        market_df = market_df[
            ["Date", "Close"]
        ].rename(
            columns={
                "Close": output_column,
            }
        )

        market_frames.append(market_df)

        print(
            f"{symbol}: {len(market_df)} rows returned."
        )

    fallback_df = market_frames[0]

    for market_df in market_frames[1:]:
        fallback_df = fallback_df.merge(
            market_df,
            on="Date",
            how="outer",
        )

    fallback_df["Date"] = (
        pd.to_numeric(
            fallback_df["Date"],
            errors="coerce",
        )
        .astype("Int64")
    )

    fallback_df = fallback_df.sort_values(
        "Date"
    ).reset_index(drop=True)

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    fallback_df.to_csv(
        OUTPUT_FILE,
        index=False,
    )

    print("\nFallback file created:")
    print(OUTPUT_FILE)

    print("\nPreview:")
    print(fallback_df.head().to_string(index=False))

    print("\nLast rows:")
    print(fallback_df.tail().to_string(index=False))

    print("\nRows:", len(fallback_df))
    print(
        "A-share non-missing rows:",
        fallback_df["A_Close"].notna().sum(),
    )
    print(
        "H-share non-missing rows:",
        fallback_df["H_Close"].notna().sum(),
    )


if __name__ == "__main__":
    build_fallback()