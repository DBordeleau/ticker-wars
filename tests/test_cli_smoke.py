from __future__ import annotations

import unittest
from contextlib import redirect_stdout
from io import StringIO
from unittest.mock import patch

from pipeline.cli import _feature_rows_for_incremental_upsert, main
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

    def test_ingest_logos_runs_without_supabase(self) -> None:
        with patch("pipeline.cli.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["ingest-logos"]), 0)

    def test_predict_horizons_command_runs_prediction_step(self) -> None:
        with patch("pipeline.cli.run_predict_horizons", return_value=0) as run_predict:
            self.assertEqual(main(["predict-horizons"]), 0)
        run_predict.assert_called_once_with()

    def test_train_predict_alias_runs_prediction_step(self) -> None:
        with patch("pipeline.cli.run_predict_horizons", return_value=0) as run_predict:
            self.assertEqual(main(["train-predict"]), 0)
        run_predict.assert_called_once_with()

    def test_ingest_prices_alias_runs_backfill(self) -> None:
        with patch("pipeline.cli.run_backfill", return_value=0) as run_backfill:
            self.assertEqual(main(["ingest-prices", "--start", "2020-01-01"]), 0)
        run_backfill.assert_called_once_with("2020-01-01", None)

    def test_ingest_latest_prices_runs_incremental_price_step(self) -> None:
        with patch("pipeline.cli.run_ingest_latest_prices", return_value=0) as run_prices:
            self.assertEqual(main(["ingest-latest-prices"]), 0)
        run_prices.assert_called_once_with()

    def test_build_features_full_refresh_flag_is_forwarded(self) -> None:
        with patch("pipeline.cli.run_build_features", return_value=0) as run_features:
            self.assertEqual(main(["build-features", "--full-refresh"]), 0)
        run_features.assert_called_once_with(full_refresh=True)

    def test_export_snapshots_alias_runs_snapshot_export(self) -> None:
        with patch("pipeline.cli.run_export_snapshot", return_value=0) as run_export:
            self.assertEqual(main(["export-snapshots"]), 0)
        run_export.assert_called_once_with()

    def test_benchmark_runtime_command_writes_report(self) -> None:
        with patch("pipeline.cli.run_benchmark_runtime", return_value=0) as run_benchmark:
            self.assertEqual(main(["benchmark-runtime", "--simple-tickers", "2"]), 0)
        run_benchmark.assert_called_once_with(
            output_path="data_exports/runtime_benchmark.json",
            simple_ticker_count=2,
            adapter_ticker_count=3,
            price_days=760,
            include_timesfm=False,
            include_chronos=False,
        )

    def test_run_daily_uses_full_horizon_pipeline_order(self) -> None:
        calls: list[str] = []

        def record(name: str):
            def _inner(*_args: object, **_kwargs: object) -> int:
                calls.append(name)
                return 0

            return _inner

        with (
            patch("pipeline.cli.load_settings", return_value=Settings(start_date="2020-01-01")),
            patch("pipeline.cli.run_ingest_latest_prices", side_effect=record("prices")),
            patch("pipeline.cli.run_ingest_fundamentals", side_effect=record("fundamentals")),
            patch("pipeline.cli.run_ingest_logos", side_effect=record("logos")),
            patch("pipeline.cli.run_build_features", side_effect=record("features")),
            patch("pipeline.cli.run_score", side_effect=record("score")),
            patch("pipeline.cli.run_predict_horizons", side_effect=record("predict")),
            patch("pipeline.cli.run_refresh_dashboard", side_effect=record("refresh")),
            patch("pipeline.cli.run_export_snapshot", side_effect=record("export")),
        ):
            self.assertEqual(main(["run-daily"]), 0)

        self.assertEqual(
            calls,
            [
                "prices",
                "fundamentals",
                "logos",
                "features",
                "score",
                "predict",
                "refresh",
                "export",
            ],
        )

    def test_incremental_feature_filter_keeps_new_and_long_horizon_refresh_rows(self) -> None:
        feature_rows = [
            {"ticker": "AAPL", "date": "2024-01-01"},
            {"ticker": "AAPL", "date": "2025-01-01"},
            {"ticker": "AAPL", "date": "2026-01-02"},
            {"ticker": "GME", "date": "2024-01-01"},
        ]

        rows = _feature_rows_for_incremental_upsert(
            feature_rows,
            latest_feature_dates={"AAPL": "2026-01-02"},
            lookback_days=430,
        )

        self.assertEqual(
            rows,
            [
                {"ticker": "AAPL", "date": "2025-01-01"},
                {"ticker": "AAPL", "date": "2026-01-02"},
                {"ticker": "GME", "date": "2024-01-01"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
