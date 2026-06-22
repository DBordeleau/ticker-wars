from __future__ import annotations

import unittest

from pipeline.evaluation.metrics import (
    absolute_percentage_error,
    calculate_model_metrics,
    direction,
)


class MetricsTest(unittest.TestCase):
    def test_direction_handles_positive_negative_and_zero_returns(self) -> None:
        self.assertEqual(direction(0.01), 1)
        self.assertEqual(direction(-0.01), -1)
        self.assertEqual(direction(0.0), 0)

    def test_absolute_percentage_error_does_not_divide_by_zero_silently(self) -> None:
        with self.assertRaises(ValueError):
            absolute_percentage_error(0.0, 10.0)

    def test_model_metrics_and_ranking_are_calculated_by_window(self) -> None:
        score_rows = [
            {
                "target_date": "2026-01-02",
                "prediction_horizon": "1w",
                "model_name": "Baseline",
                "absolute_error": 2.0,
                "squared_error": 4.0,
                "absolute_pct_error": 0.02,
                "direction_correct": 1,
            },
            {
                "target_date": "2026-01-02",
                "prediction_horizon": "1w",
                "model_name": "Linear Regression",
                "absolute_error": 1.0,
                "squared_error": 1.0,
                "absolute_pct_error": 0.01,
                "direction_correct": 0,
            },
        ]

        metrics = calculate_model_metrics(score_rows)
        all_window = [row for row in metrics if row["window"] == "all"]

        self.assertEqual(len(all_window), 2)
        self.assertTrue(all(row["prediction_horizon"] == "1w" for row in all_window))
        self.assertEqual(all_window[0]["model_name"], "Linear Regression")
        self.assertEqual(all_window[0]["rank"], 1)
        self.assertEqual(all_window[0]["mae"], 1.0)
        self.assertEqual(all_window[1]["model_name"], "Baseline")
        self.assertEqual(all_window[1]["rank"], 2)


if __name__ == "__main__":
    unittest.main()
