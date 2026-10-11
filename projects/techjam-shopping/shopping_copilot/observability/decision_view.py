"""Small, human-readable terminal view for Agent demos and debugging.

The view consumes internal trace events only.  It is deliberately separate
from the official response schema so the evaluator never sees diagnostics.
"""

from __future__ import annotations

import sys
from collections.abc import Mapping
from typing import TextIO


ATTRIBUTE_LABELS = {
    "category": "Category",
    "material": "Material",
    "color": "Color",
    "size": "Size/Fit",
    "style": "Style",
    "brand": "Brand/Store",
    "budget": "Budget",
    "feature": "Feature",
    "use_case": "Use case",
    "other": "Other requirement",
}

SLOT_ORDER = (
    "category",
    "material",
    "color",
    "size",
    "style",
    "brand",
    "budget",
    "feature",
    "use_case",
    "other",
)

_MISSING = "—"


def _values(value: object) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple, set)):
        return ()
    return tuple(dict.fromkeys(str(item).strip() for item in value if str(item).strip()))


def _slots(value: object) -> dict[str, tuple[str, ...]]:
    if not isinstance(value, Mapping):
        return {}
    return {
        str(slot): _values(values)
        for slot, values in value.items()
        if _values(values)
    }


def _value_text(values: tuple[str, ...]) -> str:
    return " / ".join(values) if values else _MISSING


def _intent_lines(event: Mapping[str, object]) -> list[str]:
    before = _slots(event.get("previous_active_slots"))
    after = _slots(event.get("active_slots"))
    before_negative = _slots(event.get("previous_negative_slots"))
    after_negative = _slots(event.get("negative_slots"))
    lines: list[str] = []

    for slot in SLOT_ORDER:
        old = before.get(slot, ())
        new = after.get(slot, ())
        if old != new:
            lines.append(
                f"  {ATTRIBUTE_LABELS.get(slot, slot)}: "
                f"{_value_text(old)} → {_value_text(new)}"
            )

    for slot in SLOT_ORDER:
        old = before_negative.get(slot, ())
        new = after_negative.get(slot, ())
        if old != new:
            lines.append(
                f"  Excluded {ATTRIBUTE_LABELS.get(slot, slot)}: "
                f"{_value_text(old)} → {_value_text(new)}"
            )

    previous_mode = str(event.get("previous_intent_mode") or "uncertain")
    current_mode = str(event.get("intent_mode") or "uncertain")
    if previous_mode != current_mode:
        lines.insert(0, f"  Mode: {previous_mode} → {current_mode}")
    if not lines:
        lines.append("  Intent unchanged (no new or superseded preference)")
    return lines


def _count(value: object) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError, OverflowError):
        return 0


def _candidate_lines(event: Mapping[str, object]) -> list[str]:
    initial = _count(event.get("probe_candidate_count"))
    retrieved = _count(event.get("retrieved_candidate_count"))
    window = _count(event.get("decision_window_count"))
    return [
        f"  Match pool → Retrieval pool → Decision window: "
        f"{initial:,} → {retrieved:,} → {window:,}"
    ]


def _attribute_label(attribute: object) -> str:
    value = str(attribute or "").strip()
    return ATTRIBUTE_LABELS.get(value, value or "Unknown attribute")


def _decision_line(event: Mapping[str, object]) -> str:
    should_ask = bool(event.get("should_ask"))
    ask_attribute = event.get("ask_attribute")
    recommendation_count = _count(event.get("recommendation_count"))
    if should_ask and recommendation_count:
        return f"  HEDGE: recommend {recommendation_count} + ask {_attribute_label(ask_attribute)}"
    if should_ask:
        return f"  ASK: ask {_attribute_label(ask_attribute)}"
    return f"  COMMIT: recommend {_count(event.get('response_recommendation_count', recommendation_count))}"


def _finite_number(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if number == number and abs(number) != float("inf") else None


def _reason_lines(event: Mapping[str, object]) -> list[str]:
    reason = str(event.get("decision_reason") or "")
    attribute = _attribute_label(event.get("ask_attribute") or event.get("selected_attribute"))
    reduction = _finite_number(
        event.get("selected_expected_reduction", event.get("expected_reduction"))
    )
    if reason == "positive_question_value" and reduction is not None:
        percentage = max(0, min(100, round(reduction * 100)))
        lines = [f"  Asking about {attribute} is expected to reduce candidate uncertainty by {percentage}%"]
        net_value = _finite_number(event.get("selected_net_value", event.get("net_value")))
        threshold = _finite_number(event.get("question_min_net_gain"))
        if net_value is not None and threshold is not None:
            lines.append(f"  Net value {net_value:.3f} ≥ turn threshold {threshold:.3f}")
        return lines

    reasons = {
        "high_confidence": "Candidate distribution is concentrated enough; another question has low expected value",
        "insufficient_question_value": "Expected question value does not cover the cost of another turn",
        "stability_stop": "Candidate ranking is stable; another question is unlikely to help",
        "question_limit": "Clarification limit reached; return the current best candidates",
        "override": "Intent override detected; stale context was cleared and search restarted",
        "turn_limit": "Turn 10 reached; return the current result",
        "recovery_category": "No candidates found; ask for the missing category first",
        "recovery_other": "No candidates found; ask for the missing requirement",
        "recovery_other_retry": "Candidates are still empty; retry open-ended requirement collection",
        "question_requested": "The current candidate pool benefits from one targeted clarification",
        "no_candidates": "No candidates matched the current request",
    }
    return [
        f"  {reasons.get(reason, reason or 'Policy used the current candidate pool and state')}"
    ]


def _api_line(event: Mapping[str, object]) -> str:
    prompt_tokens = _count(event.get("prompt_tokens"))
    completion_tokens = _count(event.get("completion_tokens"))
    ask_attribute = event.get("response_ask_attribute")
    ask_text = str(ask_attribute) if ask_attribute else "null"
    return (
        "  API response: "
        f"ask_attribute={ask_text} | "
        f"recommendations={_count(event.get('response_recommendation_count'))} | "
        f"usage={prompt_tokens}+{completion_tokens} tokens (offline)"
    )


def render_decision_view(event: Mapping[str, object]) -> str:
    """Render one trace event as a compact, four-block terminal view."""

    turn = _count(event.get("turn"))
    message = " ".join(str(event.get("user_message") or "").split())
    if len(message) > 100:
        message = f"{message[:97]}..."
    header = f"TURN {turn:02d}"
    if message:
        header += f" | User input: {message}"
    divider = "─" * max(60, min(120, len(header) + 4))
    sections = [
        divider,
        header,
        divider,
        "User intent change",
        *_intent_lines(event),
        "Candidate pool change",
        *_candidate_lines(event),
        "This-turn decision",
        _decision_line(event),
        "Decision rationale",
        *_reason_lines(event),
        _api_line(event),
        divider,
    ]
    return "\n".join(sections) + "\n"


class ConsoleDecisionTraceSink:
    """Print decision views only when explicitly enabled for a demo."""

    def __init__(self, stream: TextIO | None = None) -> None:
        self.stream = stream or sys.stdout

    def record(self, event: dict) -> None:
        self.stream.write(render_decision_view(event))
        self.stream.flush()
