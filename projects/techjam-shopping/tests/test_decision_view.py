from __future__ import annotations

import unittest

from shopping_copilot.observability.decision_view import render_decision_view


class DecisionViewTest(unittest.TestCase):
    def test_renders_the_four_decision_blocks_and_reason(self) -> None:
        output = render_decision_view(
            {
                "turn": 2,
                "user_message": "Actually white and casual.",
                "previous_intent_mode": "buying",
                "intent_mode": "buying",
                "previous_active_slots": {
                    "color": ["black"],
                    "use_case": ["running"],
                },
                "active_slots": {
                    "color": ["white"],
                    "use_case": ["casual"],
                },
                "previous_negative_slots": {},
                "negative_slots": {},
                "probe_candidate_count": 2380,
                "retrieved_candidate_count": 126,
                "decision_window_count": 18,
                "should_ask": True,
                "ask_attribute": "use_case",
                "recommendation_count": 10,
                "response_recommendation_count": 10,
                "response_ask_attribute": "use_case",
                "decision_reason": "positive_question_value",
                "selected_expected_reduction": 0.61,
                "selected_net_value": 0.041,
                "question_min_net_gain": 0.005,
                "prompt_tokens": 0,
                "completion_tokens": 0,
            }
        )

        self.assertIn("User intent change", output)
        self.assertIn("Color: black → white", output)
        self.assertIn("Use case: running → casual", output)
        self.assertIn("Candidate pool change", output)
        self.assertIn("2,380 → 126 → 18", output)
        self.assertIn("This-turn decision", output)
        self.assertIn("HEDGE: recommend 10 + ask Use case", output)
        self.assertIn("Decision rationale", output)
        self.assertIn(
            "Asking about Use case is expected to reduce candidate uncertainty by 61%",
            output,
        )
        self.assertIn("API response:", output)

    def test_renders_commit_without_leaking_internal_fields(self) -> None:
        output = render_decision_view(
            {
                "turn": 1,
                "active_slots": {},
                "negative_slots": {},
                "previous_active_slots": {},
                "previous_negative_slots": {},
                "probe_candidate_count": 18,
                "retrieved_candidate_count": 18,
                "decision_window_count": 18,
                "should_ask": False,
                "recommendation_count": 10,
                "response_recommendation_count": 10,
                "decision_reason": "high_confidence",
            }
        )

        self.assertIn("COMMIT: recommend 10", output)
        self.assertIn(
            "Candidate distribution is concentrated enough; another question has low expected value",
            output,
        )
        self.assertNotIn("decision_signals", output)


if __name__ == "__main__":
    unittest.main()
