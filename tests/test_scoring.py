from __future__ import annotations

import unittest

from pipeline.evaluation.scoring import (
    score_matured_predictions,
    score_matured_user_predictions,
)
from pipeline.forecasting.horizons import FORECAST_HORIZONS


class PredictionScoringTest(unittest.TestCase):
    def test_scores_only_predictions_with_actual_target_close(self) -> None:
        prediction_rows = [
            _prediction("AAPL", predicted_close=100.0, reference_close=100.0),
            _prediction("MSFT", predicted_close=200.0, reference_close=200.0),
        ]
        price_rows = [{"ticker": "AAPL", "date": "2026-01-02", "close": 101.0}]

        scores = score_matured_predictions(prediction_rows, price_rows)

        self.assertEqual(len(scores), 1)
        self.assertEqual(scores[0]["prediction_id"], "AAPL:2026-01-02:linear")
        self.assertEqual(scores[0]["actual_close"], 101.0)

    def test_score_values_include_error_and_direction_metrics(self) -> None:
        prediction_rows = [_prediction("AAPL", predicted_return=0.03, predicted_close=103.0)]
        price_rows = [{"ticker": "AAPL", "date": "2026-01-02", "close": 102.0}]

        score = score_matured_predictions(prediction_rows, price_rows)[0]

        self.assertAlmostEqual(score["actual_return"], 0.02)
        self.assertEqual(score["absolute_error"], 1.0)
        self.assertEqual(score["squared_error"], 1.0)
        self.assertAlmostEqual(score["absolute_pct_error"], 1.0 / 102.0)
        self.assertEqual(score["predicted_direction"], 1)
        self.assertEqual(score["actual_direction"], 1)
        self.assertEqual(score["direction_correct"], 1)

    def test_interval_score_inside_interval_uses_width_only(self) -> None:
        score = _score_single(
            actual_close=100.0,
            predicted_close_lower=95.0,
            predicted_close_upper=105.0,
        )

        self.assertTrue(score["interval_hit"])
        self.assertEqual(score["interval_width"], 10.0)
        self.assertEqual(score["interval_width_pct"], 0.10)
        self.assertEqual(score["interval_miss_distance"], 0.0)
        self.assertEqual(score["winkler_score"], 10.0)

    def test_interval_score_below_interval_uses_winkler_penalty(self) -> None:
        score = _score_single(
            actual_close=90.0,
            predicted_close_lower=95.0,
            predicted_close_upper=105.0,
        )

        self.assertFalse(score["interval_hit"])
        self.assertEqual(score["interval_miss_distance"], 5.0)
        self.assertAlmostEqual(score["winkler_score"], 60.0)

    def test_interval_score_above_interval_uses_winkler_penalty(self) -> None:
        score = _score_single(
            actual_close=110.0,
            predicted_close_lower=95.0,
            predicted_close_upper=105.0,
        )

        self.assertFalse(score["interval_hit"])
        self.assertEqual(score["interval_miss_distance"], 5.0)
        self.assertAlmostEqual(score["winkler_score"], 60.0)

    def test_null_interval_fields_remain_null(self) -> None:
        score = _score_single(actual_close=100.0)

        self.assertIsNone(score["interval_hit"])
        self.assertIsNone(score["interval_width"])
        self.assertIsNone(score["interval_width_pct"])
        self.assertIsNone(score["interval_miss_distance"])
        self.assertIsNone(score["winkler_score"])

    def test_scores_each_prediction_horizon(self) -> None:
        prediction_rows = [
            _prediction("AAPL", horizon=horizon, prediction_id=f"AAPL:{horizon}:linear")
            for horizon in FORECAST_HORIZONS
        ]
        price_rows = [{"ticker": "AAPL", "date": "2026-01-02", "close": 101.0}]

        scores = score_matured_predictions(prediction_rows, price_rows)

        self.assertEqual(len(scores), 4)
        self.assertEqual({score["prediction_horizon"] for score in scores}, set(FORECAST_HORIZONS))

    def test_scores_matured_user_predictions(self) -> None:
        prediction_rows = [
            {
                "prediction_id": "11111111-1111-1111-1111-111111111111",
                "user_id": "22222222-2222-2222-2222-222222222222",
                "ticker": "AAPL",
                "prediction_date": "2026-01-01",
                "target_date": "2026-01-02",
                "prediction_horizon": "1w",
                "predicted_return": 0.03,
                "predicted_close": 103.0,
                "reference_close": 100.0,
            }
        ]
        price_rows = [{"ticker": "AAPL", "date": "2026-01-02", "close": 102.0}]

        score = score_matured_user_predictions(prediction_rows, price_rows)[0]

        self.assertEqual(score["prediction_id"], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(score["user_id"], "22222222-2222-2222-2222-222222222222")
        self.assertAlmostEqual(score["actual_return"], 0.02)
        self.assertEqual(score["absolute_error"], 1.0)
        self.assertEqual(score["predicted_direction"], 1)
        self.assertEqual(score["actual_direction"], 1)


def _score_single(
    *,
    actual_close: float,
    predicted_close_lower: float | None = None,
    predicted_close_upper: float | None = None,
) -> dict:
    prediction = _prediction(
        "AAPL",
        predicted_close=100.0,
        reference_close=100.0,
        predicted_close_lower=predicted_close_lower,
        predicted_close_upper=predicted_close_upper,
    )
    return score_matured_predictions(
        [prediction],
        [{"ticker": "AAPL", "date": "2026-01-02", "close": actual_close}],
    )[0]


def _prediction(
    ticker: str,
    *,
    prediction_id: str | None = None,
    horizon: str = "1w",
    predicted_return: float = 0.0,
    predicted_close: float = 100.0,
    reference_close: float = 100.0,
    predicted_close_lower: float | None = None,
    predicted_close_upper: float | None = None,
) -> dict:
    row = {
        "prediction_id": prediction_id or f"{ticker}:2026-01-02:linear",
        "ticker": ticker,
        "prediction_date": "2026-01-01",
        "target_date": "2026-01-02",
        "prediction_horizon": horizon,
        "model_name": "Linear Regression",
        "model_slug": "linear-regression",
        "predicted_return": predicted_return,
        "predicted_close": predicted_close,
        "reference_close": reference_close,
    }
    if predicted_close_lower is not None:
        row["predicted_close_lower"] = predicted_close_lower
    if predicted_close_upper is not None:
        row["predicted_close_upper"] = predicted_close_upper
    return row


if __name__ == "__main__":
    unittest.main()
