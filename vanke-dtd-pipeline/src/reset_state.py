"""Reset the assessment pipeline to its original demonstration state.

This utility removes generated outputs and incremental API caches. It preserves
the original workbook and all assessment fallback files.
"""

from pathlib import Path


# =============================================================================
# Project paths
# =============================================================================

ROOT = Path(__file__).resolve().parents[1]

OUTPUT_EXCEL = ROOT / "data/output/vanke_updated.xlsx"
OUTPUT_INPUT_CSV = ROOT / "data/output/vanke_updated_input.csv"
REPLAY_OUTPUT_DIR = ROOT / "data/output/replay"

RISK_FREE_RATE_CACHE = (
    ROOT / "data/reference/risk_free_rate.csv"
)

FX_RATE_CACHE = (
    ROOT / "data/reference/cny_hkd_rates.csv"
)


# =============================================================================
# Reset logic
# =============================================================================

def remove_file(file_path):
    """Remove one generated file if it exists."""

    if file_path.exists():
        file_path.unlink()
        print("Removed:", file_path)
        return 1

    print("Already absent:", file_path)
    return 0


def reset_state():
    """Remove generated state while preserving source and fallback data."""

    print("This operation will remove:")
    print("- Official generated Excel output")
    print("- Official generated Input CSV")
    print("- Replay preview CSV files")
    print("- Incremental risk-free-rate cache")
    print("- Incremental CNY/HKD cache")
    print()
    print("The original workbook and fallback files will be preserved.")
    print()

    confirmation = input(
        "Type RESET to continue: "
    ).strip()

    if confirmation != "RESET":
        print("Reset cancelled.")
        return

    removed_count = 0

    generated_files = [
        OUTPUT_EXCEL,
        OUTPUT_INPUT_CSV,
        RISK_FREE_RATE_CACHE,
        FX_RATE_CACHE,
    ]

    for file_path in generated_files:
        removed_count += remove_file(file_path)

    if REPLAY_OUTPUT_DIR.exists():
        replay_files = list(
            REPLAY_OUTPUT_DIR.glob("replay_preview_*.csv")
        )

        for replay_file in replay_files:
            removed_count += remove_file(replay_file)

    print()
    print("Pipeline state reset completed.")
    print("Generated files removed:", removed_count)
    print()
    print("Preserved files include:")
    print("- data/raw/vanke_original.xlsx")
    print("- data/reference/market_data_fallback.csv")
    print("- data/reference/cny_hkd_rates_fallback.csv")
    print("- data/reference/risk_free_rate_fallback.csv")
    print()
    print(
        "The next daily run will start from the original "
        "workbook state."
    )


if __name__ == "__main__":
    reset_state()