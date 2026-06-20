from __future__ import annotations

import unittest

from pipeline.features.build_features import FEATURE_COLUMNS
from pipeline.llm.client import parse_llm_response
from pipeline.llm.prompt_templates import build_warren_buffbot_prompt


class WarrenBuffbotTest(unittest.TestCase):
    def test_prompt_contains_only_approved_feature_payload(self) -> None:
        feature_json = {name: 0.1 for name in FEATURE_COLUMNS}

        prompt = build_warren_buffbot_prompt("AAPL", 123.45, feature_json)

        self.assertIn("AAPL", prompt)
        self.assertIn("Reference close: 123.45", prompt)
        self.assertIn("return_1d", prompt)
        self.assertIn("Do not use news", prompt)

    def test_structured_response_parses_prediction_fields(self) -> None:
        response = parse_llm_response(
            """
            {
              "predicted_return": 0.012,
              "confidence": 0.7,
              "reasoning_summary": "Momentum is positive but measured."
            }
            """
        )

        self.assertEqual(response.predicted_return, 0.012)
        self.assertEqual(response.confidence, 0.7)
        self.assertEqual(response.reasoning_summary, "Momentum is positive but measured.")

    def test_reasoning_summary_is_clamped(self) -> None:
        response = parse_llm_response(
            {
                "predicted_return": 0.0,
                "confidence": 0.5,
                "reasoning_summary": "x" * 500,
            }.__str__().replace("'", '"')
        )

        self.assertLessEqual(len(response.reasoning_summary), 220)
        self.assertTrue(response.reasoning_summary.endswith("..."))

    def test_invalid_response_raises_cleanly(self) -> None:
        with self.assertRaises(ValueError):
            parse_llm_response("no json here")


if __name__ == "__main__":
    unittest.main()
