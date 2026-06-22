from __future__ import annotations

import unittest
from datetime import date, timedelta

from pipeline.features.build_features import FEATURE_COLUMNS
from pipeline.forecasting.horizons import FORECAST_HORIZONS, resolve_horizon_target
from pipeline.models.training import train_and_predict


def _feature_row(ticker: str, day: int, target: float | None) -> dict:
    feature_json = {name: 0.01 for name in FEATURE_COLUMNS}
    feature_json["return_1d"] = day / 10_000
    feature_date = date(2024, 1, 2) + timedelta(days=day - 1)
    return _feature_row_for_date(ticker, feature_date, target, day)


def _feature_row_for_date(
    ticker: str,
    feature_date: date,
    target: float | None,
    sequence: int,
) -> dict:
    feature_json = {name: 0.01 for name in FEATURE_COLUMNS}
    feature_json["return_1d"] = sequence / 10_000
    horizon_targets = {
        horizon: resolve_horizon_target(feature_date, horizon)
        for horizon in FORECAST_HORIZONS
    }
    return {
        "ticker": ticker,
        "date": feature_date.isoformat(),
        "feature_json": feature_json,
        "target_next_return": target,
        "target_return_1w": target,
        "target_return_1m": target,
        "target_return_3m": target,
        "target_return_1y": target,
        "target_date_1w": horizon_targets["1w"].target_date.isoformat(),
        "target_date_1m": horizon_targets["1m"].target_date.isoformat(),
        "target_date_3m": horizon_targets["3m"].target_date.isoformat(),
        "target_date_1y": horizon_targets["1y"].target_date.isoformat(),
    }


class TrainingWindowTest(unittest.TestCase):
    def test_baseline_always_predicts_zero_return(self) -> None:
        feature_rows = [_feature_row("AAPL", day, 0.001) for day in range(1, 5)]
        feature_rows.append(_feature_row("AAPL", 5, None))
        price_rows = [{"ticker": "AAPL", "date": "2024-01-06", "close": 100.0}]

        result = train_and_predict(feature_rows, price_rows)
        baseline = [row for row in result.prediction_rows if row["model_name"] == "Baseline"]

        self.assertEqual(len(baseline), 4)
        self.assertEqual({row["prediction_horizon"] for row in baseline}, set(FORECAST_HORIZONS))
        self.assertTrue(all(row["predicted_return"] == 0.0 for row in baseline))
        self.assertTrue(all(row["predicted_close"] == 100.0 for row in baseline))

    def test_statistical_models_skip_tickers_with_insufficient_rows(self) -> None:
        feature_rows = [_feature_row("AAPL", day, 0.001) for day in range(1, 5)]
        feature_rows.append(_feature_row("AAPL", 5, None))
        price_rows = [{"ticker": "AAPL", "date": "2024-01-06", "close": 100.0}]

        result = train_and_predict(feature_rows, price_rows)

        self.assertEqual(len(result.prediction_rows), 4)
        self.assertIn("fewer than 100 completed rows", result.skipped[0])
        self.assertEqual(len(result.skipped), 16)

    def test_models_train_on_completed_rows_and_predict_latest_feature_row(self) -> None:
        feature_rows = [_feature_row("AAPL", day, day / 10_000) for day in range(1, 101)]
        feature_rows.append(_feature_row("AAPL", 101, None))
        price_rows = [{"ticker": "AAPL", "date": "2024-04-12", "close": 150.0}]

        result = train_and_predict(feature_rows, price_rows)

        model_names = {row["model_name"] for row in result.prediction_rows}
        self.assertEqual(
            model_names,
            {
                "Baseline",
                "Linear Regression",
                "Ridge Regression",
                "Lasso Regression",
                "Random Forest",
            },
        )
        self.assertEqual(len(result.prediction_rows), 20)
        self.assertEqual(
            {row["prediction_horizon"] for row in result.prediction_rows},
            set(FORECAST_HORIZONS),
        )
        self.assertTrue(
            all(row["prediction_date"] == "2024-04-11" for row in result.prediction_rows)
        )
        self.assertFalse(result.skipped)

    def test_predictions_target_each_horizon_from_latest_feature_row(self) -> None:
        latest_date = date(2026, 6, 18)
        start_date = latest_date - timedelta(days=100)
        feature_rows = [
            _feature_row_for_date("AAPL", start_date + timedelta(days=day), 0.001, day)
            for day in range(100)
        ]
        feature_rows.append(_feature_row_for_date("AAPL", latest_date, None, 101))
        price_rows = [{"ticker": "AAPL", "date": "2026-06-18", "close": 150.0}]

        result = train_and_predict(feature_rows, price_rows)

        baseline_by_horizon = {
            row["prediction_horizon"]: row
            for row in result.prediction_rows
            if row["model_name"] == "Baseline"
        }

        self.assertEqual(baseline_by_horizon["1w"]["target_date"], "2026-06-25")
        self.assertEqual(baseline_by_horizon["1m"]["target_date"], "2026-07-20")
        self.assertEqual(baseline_by_horizon["3m"]["target_date"], "2026-09-18")
        self.assertEqual(baseline_by_horizon["1y"]["target_date"], "2027-06-21")


if __name__ == "__main__":
    unittest.main()
