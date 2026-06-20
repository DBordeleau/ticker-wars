from __future__ import annotations

import unittest

from pipeline.config import Settings
from pipeline.dashboard.refresh import build_dashboard_tables
from pipeline.evaluation.metrics import METRIC_WINDOWS


class DashboardContractTest(unittest.TestCase):
    def test_latest_predictions_use_latest_target_date(self) -> None:
        tables = build_dashboard_tables(
            prediction_rows=[
                _prediction("AAPL", "2026-01-02", "Baseline"),
                _prediction("AAPL", "2026-01-03", "Baseline"),
            ],
            score_rows=[],
            price_rows=[_price("AAPL", "2026-01-02", 100.0)],
            settings=Settings(),
        )

        latest = tables["dashboard_latest_predictions"]

        self.assertEqual(len(latest), 1)
        self.assertEqual(latest[0]["target_date"], "2026-01-03")
        self.assertEqual(latest[0]["model_slug"], "baseline")

    def test_model_leaderboard_contains_each_metric_window(self) -> None:
        prediction = _prediction("AAPL", "2026-01-02", "Baseline")
        tables = build_dashboard_tables(
            prediction_rows=[prediction],
            score_rows=[_score(prediction["prediction_id"])],
            price_rows=[_price("AAPL", "2026-01-02", 101.0)],
            settings=Settings(),
        )

        leaderboard = tables["dashboard_model_leaderboard"]
        windows = {row["window"] for row in leaderboard}
        baseline_30d = [
            row
            for row in leaderboard
            if row["window"] == "30d" and row["model_name"] == "Baseline"
        ][0]

        self.assertEqual(windows, set(METRIC_WINDOWS))
        self.assertEqual(baseline_30d["prediction_count"], 1)
        self.assertEqual(baseline_30d["rank"], 1)

    def test_latest_predictions_contain_frontend_required_columns(self) -> None:
        tables = build_dashboard_tables(
            prediction_rows=[_prediction("AAPL", "2026-01-02", "Linear Regression")],
            score_rows=[],
            price_rows=[_price("AAPL", "2026-01-02", 101.0)],
            settings=Settings(),
        )

        latest = tables["dashboard_latest_predictions"][0]

        self.assertIn("target_date", latest)
        self.assertIn("ticker", latest)
        self.assertIn("model_name", latest)
        self.assertIn("model_slug", latest)
        self.assertIn("reference_close", latest)
        self.assertIn("predicted_return", latest)
        self.assertIn("predicted_close", latest)

    def test_ticker_history_contains_scored_and_pending_predictions(self) -> None:
        scored_prediction = _prediction("AAPL", "2026-01-02", "Baseline")
        pending_prediction = _prediction("AAPL", "2026-01-03", "Baseline")
        tables = build_dashboard_tables(
            prediction_rows=[scored_prediction, pending_prediction],
            score_rows=[_score(scored_prediction["prediction_id"])],
            price_rows=[_price("AAPL", "2026-01-03", 101.0)],
            settings=Settings(),
        )

        history = tables["dashboard_ticker_history"]

        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]["actual_close"], 101.0)
        self.assertIsNone(history[1]["actual_close"])


def _prediction(ticker: str, target_date: str, model_name: str) -> dict:
    return {
        "prediction_id": f"{ticker}:{target_date}:{model_name}",
        "ticker": ticker,
        "prediction_date": "2026-01-01",
        "target_date": target_date,
        "model_name": model_name,
        "predicted_return": 0.01,
        "predicted_close": 101.0,
        "reference_close": 100.0,
        "reasoning_summary": None,
        "model_metadata": None,
    }


def _score(prediction_id: str) -> dict:
    return {
        "prediction_id": prediction_id,
        "actual_close": 101.0,
        "actual_return": 0.01,
        "absolute_error": 0.0,
        "squared_error": 0.0,
        "absolute_pct_error": 0.0,
        "predicted_direction": 1,
        "actual_direction": 1,
        "direction_correct": 1,
    }


def _price(ticker: str, date: str, close: float) -> dict:
    return {
        "ticker": ticker,
        "date": date,
        "close": close,
    }


if __name__ == "__main__":
    unittest.main()
