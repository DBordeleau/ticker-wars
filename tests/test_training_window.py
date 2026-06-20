from __future__ import annotations

import unittest
from datetime import date, timedelta

from pipeline.features.build_features import FEATURE_COLUMNS
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
    return {
        "ticker": ticker,
        "date": feature_date.isoformat(),
        "feature_json": feature_json,
        "target_next_return": target,
    }


class TrainingWindowTest(unittest.TestCase):
    def test_baseline_always_predicts_zero_return(self) -> None:
        feature_rows = [_feature_row("AAPL", day, 0.001) for day in range(1, 5)]
        feature_rows.append(_feature_row("AAPL", 5, None))
        price_rows = [{"ticker": "AAPL", "date": "2024-01-06", "close": 100.0}]

        result = train_and_predict(feature_rows, price_rows)
        baseline = [row for row in result.prediction_rows if row["model_name"] == "Baseline"]

        self.assertEqual(len(baseline), 1)
        self.assertEqual(baseline[0]["predicted_return"], 0.0)
        self.assertEqual(baseline[0]["predicted_close"], 100.0)

    def test_statistical_models_skip_tickers_with_insufficient_rows(self) -> None:
        feature_rows = [_feature_row("AAPL", day, 0.001) for day in range(1, 5)]
        feature_rows.append(_feature_row("AAPL", 5, None))
        price_rows = [{"ticker": "AAPL", "date": "2024-01-06", "close": 100.0}]

        result = train_and_predict(feature_rows, price_rows)

        self.assertEqual(len(result.prediction_rows), 1)
        self.assertIn("fewer than 100 completed rows", result.skipped[0])

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
        self.assertTrue(
            all(row["prediction_date"] == "2024-04-11" for row in result.prediction_rows)
        )
        self.assertFalse(result.skipped)

    def test_predictions_target_next_trading_day_not_next_weekday(self) -> None:
        latest_date = date(2026, 6, 18)
        start_date = latest_date - timedelta(days=100)
        feature_rows = [
            _feature_row_for_date("AAPL", start_date + timedelta(days=day), 0.001, day)
            for day in range(100)
        ]
        feature_rows.append(_feature_row_for_date("AAPL", latest_date, None, 101))
        price_rows = [{"ticker": "AAPL", "date": "2026-06-18", "close": 150.0}]

        result = train_and_predict(feature_rows, price_rows)

        self.assertTrue(
            all(row["target_date"] == "2026-06-22" for row in result.prediction_rows)
        )


if __name__ == "__main__":
    unittest.main()
