from __future__ import annotations

import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

from pipeline.cli import main
from pipeline.config import Settings


class CliSmokeTest(unittest.TestCase):
    def test_cli_help_runs(self) -> None:
        output = StringIO()
        with redirect_stdout(output):
            with self.assertRaises(SystemExit) as exit_context:
                main(["--help"])
        self.assertEqual(exit_context.exception.code, 0)
        help_text = output.getvalue()
        self.assertIn("run-daily", help_text)
        self.assertIn("predict-horizons", help_text)
        self.assertNotIn("train-predict", help_text)

    def test_backfill_placeholder_runs(self) -> None:
        with patch("pipeline.cli.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["backfill", "--start", "2020-01-01"]), 0)

    def test_ingest_fundamentals_runs_without_supabase(self) -> None:
        with patch("pipeline.cli.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["ingest-fundamentals"]), 0)

    def test_predict_horizons_command_runs_prediction_step(self) -> None:
        with patch("pipeline.cli.run_predict_horizons", return_value=0) as run_predict:
            self.assertEqual(main(["predict-horizons"]), 0)
        run_predict.assert_called_once_with()

    def test_train_predict_alias_runs_prediction_step(self) -> None:
        with patch("pipeline.cli.run_predict_horizons", return_value=0) as run_predict:
            self.assertEqual(main(["train-predict"]), 0)
        run_predict.assert_called_once_with()

    def test_run_daily_uses_full_horizon_pipeline_order(self) -> None:
        calls: list[str] = []

        def record(name: str):
            def _inner(*_args: object, **_kwargs: object) -> int:
                calls.append(name)
                return 0

            return _inner

        with (
            patch("pipeline.cli.load_settings", return_value=Settings(start_date="2020-01-01")),
            patch("pipeline.cli.run_backfill", side_effect=record("backfill")),
            patch("pipeline.cli.run_ingest_fundamentals", side_effect=record("fundamentals")),
            patch("pipeline.cli.run_build_features", side_effect=record("features")),
            patch("pipeline.cli.run_score", side_effect=record("score")),
            patch("pipeline.cli.run_predict_horizons", side_effect=record("predict")),
            patch("pipeline.cli.run_refresh_dashboard", side_effect=record("refresh")),
            patch("pipeline.cli.run_export_snapshot", side_effect=record("export")),
        ):
            self.assertEqual(main(["run-daily"]), 0)

        self.assertEqual(
            calls,
            ["backfill", "fundamentals", "features", "score", "predict", "refresh", "export"],
        )


if __name__ == "__main__":
    unittest.main()
