"""Create the Part 2 DTD timeline and reproducible event-window table.

The script reads the original assessment workbook only. It does not modify the
Part 1 daily-pipeline state. Missing DTD observations remain missing in the
chart, and event windows are defined over valid DTD observations.
"""

from pathlib import Path

import matplotlib.dates as mdates
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
from matplotlib.patches import Patch
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "data/raw/vanke_original.xlsx"
CHART_OUTPUT = ROOT / "docs/dtd_event_timeline.png"
WINDOW_OUTPUT = ROOT / "docs/event_window_analysis.csv"


# Events are deliberately selective rather than exhaustive. They cover a
# downgrade, successful repayments, earnings deterioration, shareholder
# support, management change, and a near-default/extension request.
EVENTS = [
    {
        "id": "E1",
        "date": "2024-03-11",
        "label": "Moody's investment-grade withdrawal",
        "classification": "Credit-negative",
        "color": "#c43d4b",
        "offset": (8, 26),
    },
    {
        "id": "E2",
        "date": "2024-06-06",
        "label": "USD bond repaid in full",
        "classification": "Credit-supportive",
        "color": "#2f8f5b",
        "offset": (8, 24),
    },
    {
        "id": "E3",
        "date": "2024-07-09",
        "label": "RMB7-9bn H1 loss warning",
        "classification": "Credit-negative",
        "color": "#c43d4b",
        "offset": (8, -36),
    },
    {
        "id": "E4",
        "date": "2025-01-27",
        "label": "Loss, liquidity and leadership cluster",
        "classification": "Mixed",
        "color": "#d8891c",
        "offset": (8, 25),
    },
    {
        "id": "E5",
        "date": "2025-05-15",
        "label": "Repayment, shareholder loan and downgrade",
        "classification": "Mixed",
        "color": "#d8891c",
        "offset": (8, -38),
    },
    {
        "id": "E6",
        "date": "2025-11-27",
        "label": "RMB2bn bond extension request",
        "classification": "Credit-negative",
        "color": "#c43d4b",
        "offset": (-165, 24),
    },
]


def load_history():
    """Load and align Input and Output sheets by company and date."""

    input_df = pd.read_excel(WORKBOOK, sheet_name="Input")
    output_df = pd.read_excel(WORKBOOK, sheet_name="Output")

    history = input_df.merge(
        output_df,
        on=["Comp_no", "Date"],
        how="inner",
        validate="one_to_one",
    )
    history["Date"] = pd.to_datetime(
        history["Date"].astype(str),
        format="%Y%m%d",
    )
    return history.sort_values("Date").reset_index(drop=True)


def arrow(previous, current):
    """Return the literal direction of one DTD transition."""

    if current > previous:
        return "↑"
    if current < previous:
        return "↓"
    return "→"


def build_event_windows(history):
    """Build T-5, T, T+1 and T+5 windows over valid DTD observations.

    T is the event date when a valid DTD exists; otherwise it is the latest
    valid DTD observation on or before the event. T+1 and T+5 therefore mean
    the next one and next five *valid DTD observations*, not calendar days.
    """

    valid = history.loc[history["DTD"].notna()].reset_index(drop=True)
    rows = []

    for event in EVENTS:
        event_date = pd.Timestamp(event["date"])
        candidates = valid.index[valid["Date"] <= event_date]
        if len(candidates) == 0:
            raise ValueError(f"No valid DTD on or before {event['date']}.")

        position = int(candidates[-1])
        if position < 5 or position + 5 >= len(valid):
            raise ValueError(f"Insufficient event window for {event['id']}.")

        points = {
            "T_minus_5": valid.iloc[position - 5],
            "T": valid.iloc[position],
            "T_plus_1": valid.iloc[position + 1],
            "T_plus_5": valid.iloc[position + 5],
        }
        values = [
            float(points["T_minus_5"]["DTD"]),
            float(points["T"]["DTD"]),
            float(points["T_plus_1"]["DTD"]),
            float(points["T_plus_5"]["DTD"]),
        ]
        path = (
            f"{values[0]:.3f} → {values[1]:.3f}{arrow(values[0], values[1])} "
            f"→ {values[2]:.3f}{arrow(values[1], values[2])} "
            f"→ {values[3]:.3f}{arrow(values[2], values[3])}"
        )

        row = {
            "Event_ID": event["id"],
            "Event_Date": event_date.date().isoformat(),
            "Event": event["label"],
            "Classification": event["classification"],
            "DTD_Path": path,
        }
        for name, point in points.items():
            row[f"{name}_Date"] = point["Date"].date().isoformat()
            row[f"{name}_DTD"] = round(float(point["DTD"]), 6)
        rows.append(row)

    return pd.DataFrame(rows)


def create_chart(history):
    """Render the historical DTD path, events and two diagnostic periods."""

    plt.style.use("seaborn-v0_8-whitegrid")
    fig, ax = plt.subplots(figsize=(15, 7.6))

    ax.plot(
        history["Date"],
        history["DTD"],
        color="#2d67a3",
        linewidth=1.8,
        label="DTD",
        zorder=2,
    )
    ax.axhline(0, color="#333333", linestyle="--", linewidth=1.0, alpha=0.8)

    ax.axvspan(
        pd.Timestamp("2024-10-03"),
        pd.Timestamp("2024-10-21"),
        color="#c43d4b",
        alpha=0.08,
        zorder=0,
    )
    ax.axvspan(
        pd.Timestamp("2025-10-08"),
        pd.Timestamp("2025-10-31"),
        color="#7d5bb5",
        alpha=0.10,
        zorder=0,
    )

    valid = history.loc[history["DTD"].notna()].set_index("Date")
    for event in EVENTS:
        event_date = pd.Timestamp(event["date"])
        event_dtd = float(valid.loc[:event_date, "DTD"].iloc[-1])
        ax.scatter(
            event_date,
            event_dtd,
            s=72,
            color=event["color"],
            edgecolor="white",
            linewidth=1.2,
            zorder=4,
        )
        ax.annotate(
            f"{event['id']}  {event_dtd:.2f}",
            xy=(event_date, event_dtd),
            xytext=event["offset"],
            textcoords="offset points",
            fontsize=9,
            fontweight="bold",
            color=event["color"],
            arrowprops={
                "arrowstyle": "-",
                "color": event["color"],
                "linewidth": 0.9,
            },
        )

    ax.text(
        pd.Timestamp("2024-10-12"),
        1.91,
        "2024 policy-rally reversal",
        ha="center",
        va="top",
        fontsize=9,
        color="#9a2f3b",
    )
    ax.text(
        pd.Timestamp("2025-10-19"),
        1.91,
        "2025 rolling-window effect",
        ha="center",
        va="top",
        fontsize=9,
        color="#64468f",
    )

    ax.set_title(
        "China Vanke DTD Trajectory and Selected Credit Events",
        fontsize=16,
        fontweight="bold",
        pad=14,
    )
    ax.set_xlabel("Date")
    ax.set_ylabel("Distance to Default (DTD)")
    ax.set_xlim(history["Date"].min(), history["Date"].max())
    ax.set_ylim(-0.12, 2.00)
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right")

    legend_items = [
        Line2D([0], [0], color="#2d67a3", linewidth=1.8, label="DTD"),
        Line2D(
            [0], [0], marker="o", color="w", markerfacecolor="#c43d4b",
            markersize=8, label="Credit-negative",
        ),
        Line2D(
            [0], [0], marker="o", color="w", markerfacecolor="#2f8f5b",
            markersize=8, label="Credit-supportive",
        ),
        Line2D(
            [0], [0], marker="o", color="w", markerfacecolor="#d8891c",
            markersize=8, label="Mixed",
        ),
        Patch(facecolor="#c43d4b", alpha=0.08, label="2024 diagnostic period"),
        Patch(facecolor="#7d5bb5", alpha=0.10, label="2025 diagnostic period"),
    ]
    ax.legend(
        handles=legend_items,
        loc="lower center",
        bbox_to_anchor=(0.5, -0.27),
        ncol=3,
        frameon=False,
    )
    ax.grid(axis="y", color="#d9d9d9", linewidth=0.7)
    ax.grid(axis="x", visible=False)
    fig.subplots_adjust(bottom=0.25, left=0.08, right=0.98, top=0.90)

    CHART_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(CHART_OUTPUT, dpi=180, bbox_inches="tight")
    plt.close(fig)


def main():
    history = load_history()
    windows = build_event_windows(history)

    create_chart(history)
    windows.to_csv(WINDOW_OUTPUT, index=False)

    print(f"Chart written to: {CHART_OUTPUT.relative_to(ROOT)}")
    print(f"Event windows written to: {WINDOW_OUTPUT.relative_to(ROOT)}")
    print(f"DTD observations: {history['DTD'].notna().sum()}")
    print(f"Missing DTD values retained: {history['DTD'].isna().sum()}")


if __name__ == "__main__":
    main()
