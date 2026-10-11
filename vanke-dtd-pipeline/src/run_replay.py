import argparse
import pandas as pd

from pipeline_core import run_replay


def parse_date(date_text):
    return pd.to_datetime(
        date_text,
        format="%Y-%m-%d",
    ).date()


parser = argparse.ArgumentParser(
    description=(
        "Replay the pipeline for a historical "
        "date range."
    )
)

parser.add_argument(
    "--start-date",
    required=False,
    help="Replay start date, format YYYY-MM-DD",
)

parser.add_argument(
    "--end-date",
    required=False,
    help="Replay end date, format YYYY-MM-DD",
)

args = parser.parse_args()


if args.start_date is None:
    args.start_date = input(
        "Enter replay start date (YYYY-MM-DD): "
    )

if args.end_date is None:
    args.end_date = input(
        "Enter replay end date (YYYY-MM-DD): "
    )


start_date = parse_date(args.start_date)
end_date = parse_date(args.end_date)

if start_date > end_date:
    raise ValueError(
        "Start date cannot be later than end date."
    )

print(
    "Running replay from",
    start_date,
    "to",
    end_date,
)

run_replay(
    start_date=start_date,
    end_date=end_date,
)