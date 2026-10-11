from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]

BACKUP_EXCEL = (
    ROOT
    / "data/output/vanke_updated_batch_backup.xlsx"
)

FALLBACK_FILE = (
    ROOT
    / "data/reference/risk_free_rate_fallback.csv"
)


def create_fallback():
    if not BACKUP_EXCEL.exists():
        raise FileNotFoundError(
            "Backup Excel file was not found: "
            + str(BACKUP_EXCEL)
        )

    input_df = pd.read_excel(
        BACKUP_EXCEL,
        sheet_name="Input",
    )

    input_df["Date"] = input_df["Date"].astype(int)

    fallback = input_df[
        (
            input_df["Date"] >= 20251215
        )
        & (
            input_df["Date"] <= 20260130
        )
    ][
        [
            "Date",
            "Risk_Free_Rate",
        ]
    ].copy()

    fallback = fallback.drop_duplicates(
        subset=["Date"]
    )

    fallback = fallback.sort_values(
        "Date"
    )

    if fallback.empty:
        raise ValueError(
            "No fallback rate data found."
        )

    fallback.to_csv(
        FALLBACK_FILE,
        index=False,
    )

    print(
        "Created fallback file:",
        FALLBACK_FILE,
    )

    print(
        "Rows:",
        len(fallback),
    )

    print(
        fallback.head().to_string(
            index=False
        ),
    )

    print(
        fallback.tail().to_string(
            index=False
        ),
    )


if __name__ == "__main__":
    create_fallback()