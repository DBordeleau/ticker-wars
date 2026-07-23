from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from pipeline.commands.daily import run_shared_daily_pipeline
from pipeline.config import Settings


class DailyPipelineTest(unittest.TestCase):
    def test_shared_context_reads_each_source_once_and_publishes_updated_rows(self) -> None:
        database = Mock()
        price_rows = [{"ticker": "AAPL", "date": "2026-07-22", "close": 100.0}]
        database.fetch_prices.return_value = price_rows
        database.fetch_predictions.return_value = [
            {"prediction_id": "model-1", "predicted_close": 101.0}
        ]
        database.fetch_prediction_scores.return_value = [
            {"prediction_id": "model-1", "absolute_error": 2.0}
        ]
        database.fetch_user_predictions.return_value = [
            {"prediction_id": "user-1", "status": "pending"},
            {"prediction_id": "user-2", "status": "scored"},
        ]
        database.fetch_user_prediction_scores.return_value = [
            {"prediction_id": "user-2", "absolute_error": 1.0}
        ]
        database.fetch_user_profiles.return_value = [{"user_id": "user-id"}]
        fundamental_rows = [{"ticker": "AAPL", "long_name": "Apple"}]
        database.fetch_latest_fundamentals.return_value = fundamental_rows
        new_model_scores = [
            {"prediction_id": "model-1", "absolute_error": 0.5},
            {"prediction_id": "model-2", "absolute_error": 0.25},
        ]
        new_user_scores = [{"prediction_id": "user-1", "absolute_error": 0.75}]
        new_predictions = [
            {"prediction_id": "model-1", "predicted_close": 102.0},
            {"prediction_id": "model-2", "predicted_close": 103.0},
        ]
        dashboard_tables = {"dashboard_latest_predictions": new_predictions}
        settings = Settings(export_dir="test-exports")

        with (
            patch("pipeline.commands.daily.load_settings", return_value=settings),
            patch(
                "pipeline.commands.daily.SupabaseDatabase.from_settings",
                return_value=database,
            ),
            patch(
                "pipeline.commands.daily.score_predictions_from_rows",
                return_value=SimpleNamespace(
                    prediction_scores=new_model_scores,
                    user_prediction_scores=new_user_scores,
                ),
            ) as score,
            patch(
                "pipeline.commands.daily.generate_predictions_from_rows",
                return_value=SimpleNamespace(prediction_rows=new_predictions),
            ) as predict,
            patch(
                "pipeline.commands.daily.build_dashboard_tables",
                return_value=dashboard_tables,
            ) as build,
            patch("pipeline.commands.daily.refresh_dashboard_tables") as refresh,
            patch("pipeline.commands.daily.export_dashboard_tables") as export,
        ):
            self.assertEqual(run_shared_daily_pipeline(), 0)

        for fetch_name in (
            "fetch_prices",
            "fetch_predictions",
            "fetch_prediction_scores",
            "fetch_user_predictions",
            "fetch_user_prediction_scores",
            "fetch_user_profiles",
            "fetch_latest_fundamentals",
        ):
            getattr(database, fetch_name).assert_called_once_with()

        self.assertEqual(
            score.call_args.kwargs["user_prediction_rows"],
            [{"prediction_id": "user-1", "status": "pending"}],
        )
        self.assertIs(score.call_args.kwargs["price_rows"], price_rows)
        self.assertIs(predict.call_args.kwargs["price_rows"], price_rows)
        self.assertIs(predict.call_args.kwargs["fundamental_rows"], fundamental_rows)

        build_kwargs = build.call_args.kwargs
        self.assertEqual(build_kwargs["prediction_rows"], new_predictions)
        self.assertEqual(build_kwargs["score_rows"], new_model_scores)
        self.assertEqual(
            build_kwargs["user_score_rows"],
            [
                {"prediction_id": "user-2", "absolute_error": 1.0},
                {"prediction_id": "user-1", "absolute_error": 0.75},
            ],
        )
        self.assertEqual(
            build_kwargs["user_prediction_rows"],
            [
                {"prediction_id": "user-1", "status": "scored"},
                {"prediction_id": "user-2", "status": "scored"},
            ],
        )
        refresh.assert_called_once_with(database, dashboard_tables)
        export.assert_called_once_with(dashboard_tables, settings.export_dir)


if __name__ == "__main__":
    unittest.main()
