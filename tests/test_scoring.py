from __future__ import annotations

import unittest

from pipeline.evaluation.scoring import score_matured_predictions


class PredictionScoringTest(unittest.TestCase):
    def test_scores_only_predictions_with_actual_target_close(self) -> None:
        prediction_rows = [
            {
                "prediction_id": "AAPL:2026-01-02:baseline",
                "ticker": "AAPL",
                "target_date": "2026-01-02",
                "model_name": "Baseline",
                "predicted_return": 0.0,
                "predicted_close": 100.0,
                "reference_close": 100.0,
            },
            {
                "prediction_id": "MSFT:2026-01-02:baseline",
                "ticker": "MSFT",
                "target_date": "2026-01-02",
                "model_name": "Baseline",
                "predicted_return": 0.0,
                "predicted_close": 200.0,
                "reference_close": 200.0,
            },
        ]
        price_rows = [{"ticker": "AAPL", "date": "2026-01-02", "close": 101.0}]

        scores = score_matured_predictions(prediction_rows, price_rows)

        self.assertEqual(len(scores), 1)
        self.assertEqual(scores[0]["prediction_id"], "AAPL:2026-01-02:baseline")
        self.assertEqual(scores[0]["actual_close"], 101.0)

    def test_score_values_include_error_and_direction_metrics(self) -> None:
        prediction_rows = [
            {
                "prediction_id": "AAPL:2026-01-02:linear",
                "ticker": "AAPL",
                "target_date": "2026-01-02",
                "model_name": "Linear Regression",
                "predicted_return": 0.03,
                "predicted_close": 103.0,
                "reference_close": 100.0,
            }
        ]
        price_rows = [{"ticker": "AAPL", "date": "2026-01-02", "close": 102.0}]

        score = score_matured_predictions(prediction_rows, price_rows)[0]

        self.assertAlmostEqual(score["actual_return"], 0.02)
        self.assertEqual(score["absolute_error"], 1.0)
        self.assertEqual(score["squared_error"], 1.0)
        self.assertAlmostEqual(score["absolute_pct_error"], 1.0 / 102.0)
        self.assertEqual(score["predicted_direction"], 1)
        self.assertEqual(score["actual_direction"], 1)
        self.assertEqual(score["direction_correct"], 1)


if __name__ == "__main__":
    unittest.main()
