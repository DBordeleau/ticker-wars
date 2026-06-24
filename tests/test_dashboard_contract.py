from __future__ import annotations

import unittest

from pipeline.config import Settings
from pipeline.dashboard.refresh import build_dashboard_tables
from pipeline.evaluation.metrics import METRIC_WINDOWS


class DashboardContractTest(unittest.TestCase):
    def test_latest_predictions_use_latest_target_date(self) -> None:
        tables = build_dashboard_tables(
            prediction_rows=[
                _prediction("AAPL", "2026-01-02", "Baseline", prediction_date="2026-01-01"),
                _prediction("AAPL", "2026-01-03", "Baseline", prediction_date="2026-01-02"),
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
        windows = {row["evaluation_window"] for row in leaderboard}
        horizons = {row["prediction_horizon"] for row in leaderboard}
        baseline_30d = [
            row
            for row in leaderboard
            if row["evaluation_window"] == "30d"
            and row["prediction_horizon"] == "1w"
            and row["model_name"] == "Baseline"
        ][0]

        self.assertEqual(windows, set(METRIC_WINDOWS))
        self.assertEqual(horizons, {"1w", "1m", "3m", "1y", "all"})
        self.assertEqual(baseline_30d["scored_count"], 1)
        self.assertEqual(baseline_30d["rank"], 1)
        self.assertEqual(baseline_30d["model_type"], "Benchmark")

    def test_dashboard_outputs_model_metrics_table(self) -> None:
        prediction = _prediction("AAPL", "2026-01-02", "Baseline")
        tables = build_dashboard_tables(
            prediction_rows=[prediction],
            score_rows=[_score(prediction["prediction_id"])],
            price_rows=[_price("AAPL", "2026-01-02", 101.0)],
            settings=Settings(),
        )

        metrics = tables["dashboard_model_metrics"]
        pooled_metric = [
            row
            for row in metrics
            if row["evaluation_window"] == "all"
            and row["prediction_horizon"] == "all"
            and row["model_name"] == "Baseline"
        ][0]

        self.assertEqual(pooled_metric["model_slug"], "baseline")
        self.assertEqual(pooled_metric["scored_count"], 1)

    def test_model_leaderboard_hides_removed_linear_variants(self) -> None:
        ridge_prediction = _prediction("AAPL", "2026-01-02", "Ridge Regression")
        tables = build_dashboard_tables(
            prediction_rows=[ridge_prediction],
            score_rows=[_score(ridge_prediction["prediction_id"], model_name="Ridge Regression")],
            price_rows=[_price("AAPL", "2026-01-02", 101.0)],
            settings=Settings(),
        )

        model_names = {row["model_name"] for row in tables["dashboard_model_leaderboard"]}

        self.assertNotIn("Ridge Regression", model_names)
        self.assertNotIn("Lasso Regression", model_names)
        self.assertIn("Chronos-2", model_names)
        self.assertIn("TimesFM", model_names)

    def test_latest_predictions_contain_frontend_required_columns(self) -> None:
        tables = build_dashboard_tables(
            prediction_rows=[_prediction("AAPL", "2026-01-02", "Linear Regression")],
            score_rows=[],
            price_rows=[_price("AAPL", "2026-01-02", 101.0)],
            settings=Settings(),
        )

        latest = tables["dashboard_latest_predictions"][0]

        self.assertIn("target_date", latest)
        self.assertIn("prediction_date", latest)
        self.assertIn("prediction_horizon", latest)
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

    def test_user_dashboard_tables_exclude_private_users(self) -> None:
        public_user_id = "11111111-1111-1111-1111-111111111111"
        private_user_id = "22222222-2222-2222-2222-222222222222"
        tables = build_dashboard_tables(
            prediction_rows=[],
            score_rows=[],
            price_rows=[],
            settings=Settings(),
            user_prediction_rows=[
                _user_prediction(public_user_id, "AAPL", predicted_close=101.0),
                _user_prediction(private_user_id, "MSFT", predicted_close=199.0),
            ],
            user_score_rows=[
                _user_score(public_user_id, absolute_error=1.0),
                _user_score(private_user_id, absolute_error=0.5),
            ],
            user_profile_rows=[
                _user_profile(public_user_id, "PublicTrader", is_public=True),
                _user_profile(private_user_id, "PrivateTrader", is_public=False),
            ],
        )

        leaderboard = tables["dashboard_user_leaderboard"]
        ticker_leaderboard = tables["dashboard_user_ticker_leaderboard"]
        latest_predictions = tables["dashboard_latest_user_predictions"]

        self.assertTrue(leaderboard)
        self.assertEqual({row["username"] for row in leaderboard}, {"PublicTrader"})
        self.assertEqual({row["username"] for row in ticker_leaderboard}, {"PublicTrader"})
        self.assertEqual(len(latest_predictions), 1)
        self.assertEqual(latest_predictions[0]["username"], "PublicTrader")
        self.assertEqual(latest_predictions[0]["avatar_style"], "adventurer-neutral")

    def test_user_leaderboard_ranks_public_users_by_mae(self) -> None:
        ada_id = "11111111-1111-1111-1111-111111111111"
        grace_id = "22222222-2222-2222-2222-222222222222"
        tables = build_dashboard_tables(
            prediction_rows=[],
            score_rows=[],
            price_rows=[],
            settings=Settings(),
            user_prediction_rows=[],
            user_score_rows=[
                _user_score(ada_id, absolute_error=2.0),
                _user_score(grace_id, absolute_error=1.0),
            ],
            user_profile_rows=[
                _user_profile(ada_id, "Ada", is_public=True),
                _user_profile(grace_id, "Grace", is_public=True),
            ],
        )

        leaderboard = [
            row
            for row in tables["dashboard_user_leaderboard"]
            if row["evaluation_window"] == "all" and row["prediction_horizon"] == "1w"
        ]

        self.assertEqual([row["username"] for row in leaderboard], ["Grace", "Ada"])
        self.assertEqual([row["rank"] for row in leaderboard], [1, 2])

    def test_user_ticker_leaderboard_ranks_within_each_ticker(self) -> None:
        ada_id = "11111111-1111-1111-1111-111111111111"
        grace_id = "22222222-2222-2222-2222-222222222222"
        tables = build_dashboard_tables(
            prediction_rows=[],
            score_rows=[],
            price_rows=[],
            settings=Settings(),
            user_prediction_rows=[],
            user_score_rows=[
                _user_score(ada_id, absolute_error=4.0, ticker="AAPL"),
                _user_score(grace_id, absolute_error=1.0, ticker="AAPL"),
                _user_score(ada_id, absolute_error=1.0, ticker="MSFT"),
                _user_score(grace_id, absolute_error=4.0, ticker="MSFT"),
            ],
            user_profile_rows=[
                _user_profile(ada_id, "Ada", is_public=True),
                _user_profile(grace_id, "Grace", is_public=True),
            ],
        )

        aapl_rows = [
            row
            for row in tables["dashboard_user_ticker_leaderboard"]
            if row["ticker"] == "AAPL"
            and row["evaluation_window"] == "all"
            and row["prediction_horizon"] == "1w"
        ]
        msft_rows = [
            row
            for row in tables["dashboard_user_ticker_leaderboard"]
            if row["ticker"] == "MSFT"
            and row["evaluation_window"] == "all"
            and row["prediction_horizon"] == "1w"
        ]

        self.assertEqual([row["username"] for row in aapl_rows], ["Grace", "Ada"])
        self.assertEqual([row["username"] for row in msft_rows], ["Ada", "Grace"])


def _prediction(
    ticker: str,
    target_date: str,
    model_name: str,
    prediction_date: str = "2026-01-01",
) -> dict:
    return {
        "prediction_id": f"{ticker}:{target_date}:{model_name}",
        "ticker": ticker,
        "prediction_date": prediction_date,
        "target_date": target_date,
        "prediction_horizon": "1w",
        "horizon_calendar_days": 1,
        "horizon_trading_days": 1,
        "model_name": model_name,
        "model_slug": model_name.lower().replace(" ", "-"),
        "predicted_return": 0.01,
        "predicted_close": 101.0,
        "reference_close": 100.0,
        "reasoning_summary": None,
        "model_metadata": None,
    }


def _score(prediction_id: str, model_name: str = "Baseline") -> dict:
    return {
        "prediction_id": prediction_id,
        "ticker": "AAPL",
        "prediction_date": "2026-01-01",
        "target_date": "2026-01-02",
        "prediction_horizon": "1w",
        "model_name": model_name,
        "model_slug": model_name.lower().replace(" ", "-"),
        "actual_close": 101.0,
        "actual_return": 0.01,
        "absolute_error": 0.0,
        "squared_error": 0.0,
        "absolute_pct_error": 0.0,
        "predicted_direction": 1,
        "actual_direction": 1,
        "direction_correct": 1,
        "scored_at": "2026-01-02T12:00:00+00:00",
    }


def _price(ticker: str, date: str, close: float) -> dict:
    return {
        "ticker": ticker,
        "date": date,
        "close": close,
    }


def _user_profile(user_id: str, username: str, *, is_public: bool) -> dict:
    return {
        "user_id": user_id,
        "username": username.lower(),
        "display_username": username,
        "is_public": is_public,
        "avatar_style": "adventurer-neutral",
        "avatar_seed": f"{username}-seed",
        "avatar_options": {"backgroundColor": "f2d3b1"},
    }


def _user_prediction(user_id: str, ticker: str, *, predicted_close: float) -> dict:
    return {
        "prediction_id": f"00000000-0000-0000-0000-{ticker.lower().ljust(12, '0')[:12]}",
        "user_id": user_id,
        "ticker": ticker,
        "prediction_date": "2026-01-01",
        "target_date": "2026-01-08",
        "prediction_horizon": "1w",
        "reference_close": 100.0,
        "predicted_close": predicted_close,
        "predicted_return": predicted_close / 100.0 - 1,
        "status": "pending",
    }


def _user_score(user_id: str, *, absolute_error: float, ticker: str = "AAPL") -> dict:
    return {
        "prediction_id": f"{user_id}:{ticker}:score",
        "user_id": user_id,
        "ticker": ticker,
        "prediction_date": "2026-01-01",
        "target_date": "2026-01-08",
        "prediction_horizon": "1w",
        "actual_close": 101.0,
        "actual_return": 0.01,
        "absolute_error": absolute_error,
        "squared_error": absolute_error**2,
        "absolute_pct_error": absolute_error / 101.0,
        "predicted_direction": 1,
        "actual_direction": 1,
        "direction_correct": 1,
        "scored_at": "2026-01-08T12:00:00+00:00",
    }


if __name__ == "__main__":
    unittest.main()
