from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import patch

from pipeline.config import Settings
from pipeline.features.build_features import FEATURE_COLUMNS
from pipeline.forecasting.horizons import FORECAST_HORIZONS, resolve_horizon_target
from pipeline.llm.client import LLMResponse, parse_llm_response
from pipeline.llm.prompt_templates import build_warren_buffbot_prompt
from pipeline.models.warren_buffbot import generate_warren_buffbot_predictions


class WarrenBuffbotTest(unittest.TestCase):
    def test_prompt_contains_only_approved_feature_payload(self) -> None:
        feature_json = {name: 0.1 for name in FEATURE_COLUMNS}

        prompt = build_warren_buffbot_prompt(
            "AAPL",
            123.45,
            feature_json,
            horizon_label="1M",
            target_date="2026-07-22",
            fundamentals={"market_cap": 123_000_000_000, "trailing_pe": 18.5},
        )

        self.assertIn("AAPL", prompt)
        self.assertIn("Reference close: 123.45", prompt)
        self.assertIn("Prediction horizon: 1M", prompt)
        self.assertIn("trailing_pe", prompt)
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

    def test_buffbot_generates_prediction_for_each_horizon(self) -> None:
        with (
            patch("pipeline.models.warren_buffbot.is_llm_configured", return_value=True),
            patch(
                "pipeline.models.warren_buffbot.request_structured_prediction",
                return_value=LLMResponse(
                    predicted_return=0.01,
                    confidence=0.6,
                    reasoning_summary="Value signals are constructive.",
                ),
            ),
        ):
            rows = generate_warren_buffbot_predictions(
                feature_rows=[_feature_row("AAPL", date(2026, 6, 18))],
                price_rows=[{"ticker": "AAPL", "date": "2026-06-18", "close": 100.0}],
                settings=Settings(gemini_api_key="fake", warren_buffbot_enabled=True),
                fundamental_rows=[{"ticker": "AAPL", "market_cap": 123_000_000_000}],
            )

        self.assertEqual(len(rows), 4)
        self.assertEqual({row["prediction_horizon"] for row in rows}, set(FORECAST_HORIZONS))
        self.assertTrue(all(row["model_slug"] == "warren-buffbot" for row in rows))
        self.assertTrue(
            all(row["model_metadata"]["fundamentals_available"] for row in rows)
        )


def _feature_row(ticker: str, feature_date: date) -> dict:
    feature_json = {name: 0.1 for name in FEATURE_COLUMNS}
    horizon_targets = {
        horizon: resolve_horizon_target(feature_date, horizon)
        for horizon in FORECAST_HORIZONS
    }
    return {
        "ticker": ticker,
        "date": feature_date.isoformat(),
        "feature_json": feature_json,
        "target_return_1w": 0.01,
        "target_return_1m": 0.02,
        "target_return_3m": 0.03,
        "target_return_1y": 0.04,
        "target_date_1w": horizon_targets["1w"].target_date.isoformat(),
        "target_date_1m": horizon_targets["1m"].target_date.isoformat(),
        "target_date_3m": horizon_targets["3m"].target_date.isoformat(),
        "target_date_1y": horizon_targets["1y"].target_date.isoformat(),
    }


if __name__ == "__main__":
    unittest.main()
