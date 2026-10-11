import pandas as pd

from pipeline_core import run_daily


def parse_date(date_text):
    return pd.to_datetime(
        date_text,
        format="%Y-%m-%d",
    ).date()


date_text = input(
    "Enter simulated run date (YYYY-MM-DD): "
)

run_date = parse_date(date_text)

print(
    "Running daily pipeline as of:",
    run_date,
)

run_daily(
    run_date=run_date
)