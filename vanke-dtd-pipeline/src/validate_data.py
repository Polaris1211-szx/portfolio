"""Validate the official DTD pipeline output.

This script performs offline consistency checks. It does not request external
APIs or modify any project files.
"""

from pathlib import Path

import pandas as pd


# =============================================================================
# Project paths and data contract
# =============================================================================

ROOT = Path(__file__).resolve().parents[1]

ORIGINAL_EXCEL = ROOT / "data/raw/vanke_original.xlsx"
UPDATED_EXCEL = ROOT / "data/output/vanke_updated.xlsx"
UPDATED_INPUT_CSV = ROOT / "data/output/vanke_updated_input.csv"

COMPANY_NUMBER = 5338
MINIMUM_SUBMISSION_ROWS = 5

EXPECTED_INPUT_COLUMNS = [
    "Comp_no",
    "Date",
    "CUR_MKT_CAP(HKD)",
    "BS_CUR_LIAB(HKD)",
    "BS_LT_BORROW(HKD)",
    "BS_TOT_LIAB2(HKD)",
    "BS_TOT_ASSET(HKD)",
    "Risk_Free_Rate",
]


# =============================================================================
# Validation utilities
# =============================================================================

def require_file(file_path):
    """Raise a clear error when a required file is unavailable."""

    if not file_path.exists():
        raise FileNotFoundError(
            f"Required file was not found: {file_path}"
        )


def compare_frames(left, right, description):
    """Compare two DataFrames while allowing harmless dtype differences."""

    try:
        pd.testing.assert_frame_equal(
            left.reset_index(drop=True),
            right.reset_index(drop=True),
            check_dtype=False,
            check_exact=False,
            rtol=1e-10,
            atol=1e-8,
        )

    except AssertionError as error:
        raise AssertionError(
            f"{description} failed.\n{error}"
        ) from error


def validate_input_structure(input_df, label):
    """Validate the schema and row-level consistency of an Input dataset."""

    if list(input_df.columns) != EXPECTED_INPUT_COLUMNS:
        raise ValueError(
            f"{label} has an unexpected schema.\n"
            f"Expected: {EXPECTED_INPUT_COLUMNS}\n"
            f"Actual: {list(input_df.columns)}"
        )

    if input_df.empty:
        raise ValueError(f"{label} is empty.")

    if input_df.isna().any().any():
        missing_counts = input_df.isna().sum()
        missing_counts = missing_counts[
            missing_counts > 0
        ]

        raise ValueError(
            f"{label} contains missing values:\n"
            f"{missing_counts}"
        )

    numeric_dates = pd.to_numeric(
        input_df["Date"],
        errors="coerce",
    )

    if numeric_dates.isna().any():
        raise ValueError(
            f"{label} contains invalid dates."
        )

    if numeric_dates.duplicated().any():
        duplicate_dates = numeric_dates[
            numeric_dates.duplicated(keep=False)
        ].tolist()

        raise ValueError(
            f"{label} contains duplicate dates: "
            f"{duplicate_dates}"
        )

    if not numeric_dates.is_monotonic_increasing:
        raise ValueError(
            f"{label} dates are not in ascending order."
        )

    company_numbers = set(
        pd.to_numeric(
            input_df["Comp_no"],
            errors="coerce",
        ).dropna().astype(int)
    )

    if company_numbers != {COMPANY_NUMBER}:
        raise ValueError(
            f"{label} contains unexpected company numbers: "
            f"{sorted(company_numbers)}"
        )

    market_cap = pd.to_numeric(
        input_df["CUR_MKT_CAP(HKD)"],
        errors="coerce",
    )

    if market_cap.isna().any():
        raise ValueError(
            f"{label} contains invalid market-cap values."
        )

    if (market_cap <= 0).any():
        invalid_dates = input_df.loc[
            market_cap <= 0,
            "Date",
        ].tolist()

        raise ValueError(
            "Non-positive market capitalization was detected "
            f"for dates: {invalid_dates}"
        )

    risk_free_rate = pd.to_numeric(
        input_df["Risk_Free_Rate"],
        errors="coerce",
    )

    if risk_free_rate.isna().any():
        raise ValueError(
            f"{label} contains invalid risk-free-rate values."
        )


# =============================================================================
# Main validation
# =============================================================================

def validate_pipeline_output():
    """Validate the official Excel and CSV pipeline outputs."""

    require_file(ORIGINAL_EXCEL)
    require_file(UPDATED_EXCEL)
    require_file(UPDATED_INPUT_CSV)

    original_input = pd.read_excel(
        ORIGINAL_EXCEL,
        sheet_name="Input",
    )

    original_output = pd.read_excel(
        ORIGINAL_EXCEL,
        sheet_name="Output",
    )

    updated_input = pd.read_excel(
        UPDATED_EXCEL,
        sheet_name="Input",
    )

    updated_output = pd.read_excel(
        UPDATED_EXCEL,
        sheet_name="Output",
    )

    updated_csv = pd.read_csv(
        UPDATED_INPUT_CSV,
    )

    validate_input_structure(
        original_input,
        "Original Input",
    )

    validate_input_structure(
        updated_input,
        "Updated Excel Input",
    )

    validate_input_structure(
        updated_csv,
        "Updated CSV Input",
    )

    if len(updated_input) < len(original_input):
        raise ValueError(
            "The updated Input contains fewer rows than "
            "the original Input."
        )

    historical_input = updated_input.iloc[
        : len(original_input)
    ]

    compare_frames(
        historical_input,
        original_input,
        "Historical Input preservation check",
    )

    compare_frames(
        updated_output,
        original_output,
        "Historical Output preservation check",
    )

    compare_frames(
        updated_input,
        updated_csv,
        "Excel and CSV consistency check",
    )

    new_rows = updated_input.iloc[
        len(original_input):
    ].copy()

    original_last_date = int(
        pd.to_numeric(
            original_input["Date"],
            errors="raise",
        ).max()
    )

    if not new_rows.empty:
        new_dates = pd.to_numeric(
            new_rows["Date"],
            errors="raise",
        ).astype(int)

        if (new_dates <= original_last_date).any():
            raise ValueError(
                "One or more new rows do not occur after "
                "the original historical period."
            )

    print("\nPipeline validation passed.")
    print("----------------------------------------")
    print("Original Input rows:", len(original_input))
    print("Updated Excel Input rows:", len(updated_input))
    print("Updated CSV Input rows:", len(updated_csv))
    print("Historical Output rows:", len(updated_output))
    print("New Input rows:", len(new_rows))
    print("First date:", int(updated_input["Date"].min()))
    print("Last date:", int(updated_input["Date"].max()))
    print(
        "Duplicate dates:",
        int(updated_input["Date"].duplicated().sum()),
    )
    print(
        "Missing values:",
        int(updated_input.isna().sum().sum()),
    )
    print(
        "Company numbers:",
        sorted(updated_input["Comp_no"].unique().tolist()),
    )
    print("Historical Input unchanged: True")
    print("Historical Output unchanged: True")
    print("Excel and CSV match: True")

    if new_rows.empty:
        print(
            "\nSubmission status: no incremental rows have "
            "been generated yet."
        )

    elif len(new_rows) < MINIMUM_SUBMISSION_ROWS:
        remaining = (
            MINIMUM_SUBMISSION_ROWS
            - len(new_rows)
        )

        print(
            "\nSubmission status: structurally valid, but "
            f"{remaining} additional daily increment(s) are "
            "recommended to demonstrate five trading days."
        )

    else:
        print(
            "\nSubmission status: ready. At least five daily "
            "incremental rows are present."
        )


if __name__ == "__main__":
    validate_pipeline_output()