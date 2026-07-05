from __future__ import annotations

import unittest

from pipeline.evaluation.metrics import (
    absolute_percentage_error,
    calculate_model_metrics,
    calculate_user_metrics,
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

    def test_model_metrics_handles_empty_scores(self) -> None:
        self.assertEqual(calculate_model_metrics([]), [])

    def test_model_metrics_and_ranking_are_calculated_by_window(self) -> None:
        score_rows = [
            {
                "target_date": "2026-01-02",
                "scored_at": "2026-02-01T12:00:00+00:00",
                "prediction_horizon": "1w",
                "model_name": "Baseline",
                "absolute_error": 1.0,
                "squared_error": 1.0,
                "absolute_pct_error": 0.02,
                "direction_correct": 1,
            },
            {
                "target_date": "2026-01-02",
                "scored_at": "2026-02-01T12:00:00+00:00",
                "prediction_horizon": "1w",
                "model_name": "Linear Regression",
                "absolute_error": 2.0,
                "squared_error": 4.0,
                "absolute_pct_error": 0.01,
                "direction_correct": 0,
            },
        ]

        metrics = calculate_model_metrics(score_rows)
        one_week_window = [
            row
            for row in metrics
            if row["window"] == "all" and row["prediction_horizon"] == "1w"
        ]
        pooled_window = [
            row
            for row in metrics
            if row["window"] == "all" and row["prediction_horizon"] == "all"
        ]

        self.assertEqual(len(one_week_window), 2)
        self.assertEqual(len(pooled_window), 2)
        self.assertEqual(one_week_window[0]["model_name"], "Linear Regression")
        self.assertEqual(one_week_window[0]["rank"], 1)
        self.assertEqual(one_week_window[0]["mae"], 2.0)
        self.assertEqual(one_week_window[0]["mape"], 0.01)
        self.assertEqual(one_week_window[1]["model_name"], "Baseline")
        self.assertEqual(one_week_window[1]["rank"], 2)

    def test_metric_windows_filter_by_scored_at_not_target_date(self) -> None:
        score_rows = [
            _score_row(
                model_name="Baseline",
                target_date="2020-01-01",
                scored_at="2026-02-01T12:00:00+00:00",
                absolute_error=1.0,
            ),
            _score_row(
                model_name="Linear Regression",
                target_date="2026-02-01",
                scored_at="2026-01-01T12:00:00+00:00",
                absolute_error=0.5,
            ),
        ]

        metrics = calculate_model_metrics(score_rows)
        seven_day_metrics = [
            row
            for row in metrics
            if row["window"] == "7d" and row["prediction_horizon"] == "1w"
        ]

        self.assertEqual(len(seven_day_metrics), 1)
        self.assertEqual(seven_day_metrics[0]["model_name"], "Baseline")

    def test_user_metrics_rank_by_percent_error_and_include_pooled_horizon(self) -> None:
        score_rows = [
            _user_score_row(
                user_id="user-a",
                username="Ada",
                absolute_error=1.0,
                absolute_pct_error=0.04,
            ),
            _user_score_row(
                user_id="user-b",
                username="Grace",
                absolute_error=2.0,
                absolute_pct_error=0.02,
            ),
        ]

        metrics = calculate_user_metrics(score_rows)
        one_week_window = [
            row
            for row in metrics
            if row["window"] == "all" and row["prediction_horizon"] == "1w"
        ]
        pooled_window = [
            row
            for row in metrics
            if row["window"] == "all" and row["prediction_horizon"] == "all"
        ]

        self.assertEqual(len(one_week_window), 2)
        self.assertEqual(len(pooled_window), 2)
        self.assertEqual(one_week_window[0]["user_id"], "user-b")
        self.assertEqual(one_week_window[0]["username"], "Grace")
        self.assertEqual(one_week_window[0]["rank"], 1)
        self.assertEqual(one_week_window[0]["mape"], 0.02)
        self.assertEqual(one_week_window[1]["rank"], 2)


def _score_row(
    *,
    model_name: str,
    target_date: str,
    scored_at: str,
    absolute_error: float,
) -> dict:
    return {
        "target_date": target_date,
        "scored_at": scored_at,
        "prediction_horizon": "1w",
        "model_name": model_name,
        "absolute_error": absolute_error,
        "squared_error": absolute_error**2,
        "absolute_pct_error": absolute_error / 100,
        "direction_correct": 1,
    }


def _user_score_row(
    *,
    user_id: str,
    username: str,
    absolute_error: float,
    absolute_pct_error: float | None = None,
    scored_at: str = "2026-02-01T12:00:00+00:00",
) -> dict:
    return {
        "user_id": user_id,
        "username": username,
        "target_date": "2026-01-02",
        "scored_at": scored_at,
        "prediction_horizon": "1w",
        "absolute_error": absolute_error,
        "squared_error": absolute_error**2,
        "absolute_pct_error": (
            absolute_pct_error if absolute_pct_error is not None else absolute_error / 100
        ),
        "direction_correct": 1,
    }


if __name__ == "__main__":
    unittest.main()
