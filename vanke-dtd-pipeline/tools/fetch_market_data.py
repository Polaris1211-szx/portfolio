"""
Fetch daily A-share and H-share closing prices for China Vanke.

Data source:
Tencent public market-data JSON endpoint.

A-share symbol:
sz000002

H-share symbol:
hk02202
"""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import pandas as pd
import requests


API_URL = "https://web.ifzq.gtimg.cn/appstock/app/kline/kline"

A_SHARE_SYMBOL = "sz000002"
H_SHARE_SYMBOL = "hk02202"

REQUEST_TIMEOUT = 20


def validate_date(date_text: str) -> str:
    """Validate and return a date in YYYY-MM-DD format."""
    try:
        parsed = datetime.strptime(date_text, "%Y-%m-%d")
    except ValueError as error:
        raise ValueError(
            f"Invalid date: {date_text}. Expected format: YYYY-MM-DD."
        ) from error

    return parsed.strftime("%Y-%m-%d")


def fetch_one_market(
    symbol: str,
    target_date: str,
    market_name: str,
) -> dict | None:
    """
    Fetch one market's daily data for the target date.

    Returned row format from Tencent is:
    [date, open, close, high, low, volume]
    """

    request_params = {
        "param": (
            f"{symbol},day,"
            f"{target_date},{target_date},10"
        )
    }

    response = requests.get(
        API_URL,
        params=request_params,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()
    payload = response.json()

    if payload.get("code") != 0:
        raise RuntimeError(
            f"{market_name} API returned an unexpected response: {payload}"
        )

    market_data = payload.get("data", {}).get(symbol, {})
    rows = market_data.get("day", [])

    if not rows:
        print(
            f"{market_name}: no market data available for {target_date}."
        )
        return None

    for row in rows:
        if len(row) < 6:
            continue

        row_date = row[0]

        if row_date == target_date:
            return {
                "Date": target_date.replace("-", ""),
                "Market": market_name,
                "Symbol": symbol,
                "Close": float(row[2]),
                "Open": float(row[1]),
                "High": float(row[3]),
                "Low": float(row[4]),
                "Volume": float(row[5]),
                "Source": "Tencent public JSON API",
            }

    print(
        f"{market_name}: target date {target_date} "
        "was not returned by the API."
    )
    return None


def fetch_vanke_prices(target_date: str) -> pd.DataFrame:
    """
    Fetch A-share and H-share prices for one date.

    If one market is closed on the target date, that market may return no row.
    This is expected because A-share and H-share trading calendars differ.
    """

    target_date = validate_date(target_date)

    rows = []

    print(f"Fetching market data for {target_date}...")

    for symbol, market_name in [
        (A_SHARE_SYMBOL, "A-share"),
        (H_SHARE_SYMBOL, "H-share"),
    ]:
        try:
            result = fetch_one_market(
                symbol=symbol,
                target_date=target_date,
                market_name=market_name,
            )

            if result is not None:
                rows.append(result)
                print(
                    f"{market_name}: close price = "
                    f"{result['Close']}"
                )

        except requests.RequestException as error:
            print(f"{market_name}: request failed: {error}")

        except (ValueError, KeyError, RuntimeError) as error:
            print(f"{market_name}: invalid API response: {error}")

    result_df = pd.DataFrame(rows)

    if result_df.empty:
        print(f"No market data found for {target_date}.")
        return result_df

    return result_df


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Fetch China Vanke A-share and H-share "
            "closing prices."
        )
    )

    parser.add_argument(
        "--date",
        required=True,
        help="Target date in YYYY-MM-DD format.",
    )

    args = parser.parse_args()

    result = fetch_vanke_prices(args.date)

    if result.empty:
        raise SystemExit(
            "No valid market data was returned."
        )

    print("\nReturned data:")
    print(result.to_string(index=False))


if __name__ == "__main__":
    main()