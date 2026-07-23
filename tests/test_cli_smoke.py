from __future__ import annotations

import unittest
from contextlib import redirect_stdout
from datetime import UTC, datetime, timedelta
from io import StringIO
from types import SimpleNamespace
from unittest.mock import patch

from pipeline.cli import (
    _bounded_feature_rows_from_prices,
    _report_live_price_health,
    main,
    run_build_features,
    run_predict_horizons,
    run_prune_engagement_events,
    run_seed_model_predictions,
)
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
        with patch("pipeline.commands.ingestion.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["backfill", "--start", "2020-01-01"]), 0)

    def test_ingest_fundamentals_runs_without_supabase(self) -> None:
        with patch("pipeline.commands.ingestion.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["ingest-fundamentals"]), 0)

    def test_ingest_logos_runs_without_supabase(self) -> None:
        with patch("pipeline.commands.ingestion.SupabaseDatabase.from_settings", return_value=None):
            self.assertEqual(main(["ingest-logos"]), 0)

    def test_predict_horizons_command_runs_prediction_step(self) -> None:
        with patch("pipeline.cli.run_predict_horizons", return_value=0) as run_predict:
            self.assertEqual(main(["predict-horizons"]), 0)
        run_predict.assert_called_once_with()

    def test_seed_model_predictions_command_forwards_options(self) -> None:
        with patch("pipeline.cli.run_seed_model_predictions", return_value=0) as run_seed:
            self.assertEqual(
                main(
                    [
                        "seed-model-predictions",
                        "--target-start",
                        "2026-07-01",
                        "--target-end",
                        "2026-07-02",
                        "--tickers",
                        "aapl, gme",
                        "--models",
                        "Baseline,TimesFM",
                        "--dry-run",
                        "--include-latest",
                    ]
                ),
                0,
            )
        run_seed.assert_called_once_with(
            target_start="2026-07-01",
            target_end="2026-07-02",
            tickers=("AAPL", "GME"),
            model_slugs=("baseline", "timesfm"),
            dry_run=True,
            include_latest=True,
        )

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

    def test_prune_engagement_events_command_forwards_seen_days(self) -> None:
        with patch("pipeline.cli.run_prune_engagement_events", return_value=0) as run_prune:
            self.assertEqual(main(["prune-engagement-events", "--seen-days", "45"]), 0)
        run_prune.assert_called_once_with(seen_days=45)

    def test_prune_engagement_events_rejects_invalid_retention_window(self) -> None:
        self.assertEqual(run_prune_engagement_events(seen_days=0), 1)

    def test_prune_engagement_events_calls_database_retention_rpc(self) -> None:
        class FakeDatabase:
            def __init__(self) -> None:
                self.seen_before: str | None = None

            def prune_user_engagement_events(self, seen_before: str):
                self.seen_before = seen_before
                return 4

        fake_database = FakeDatabase()

        with patch(
            "pipeline.commands.ingestion.SupabaseDatabase.from_settings", return_value=fake_database
        ):
            self.assertEqual(run_prune_engagement_events(seen_days=90), 0)

        self.assertIsNotNone(fake_database.seen_before)

    def test_refresh_live_prices_command_forwards_tickers_and_dry_run(self) -> None:
        with patch("pipeline.cli.run_refresh_live_prices", return_value=0) as run_live:
            self.assertEqual(
                main(
                    [
                        "refresh-live-prices",
                        "--tickers",
                        "aapl, msft,AAPL",
                        "--dry-run",
                        "--regular-hours-only",
                        "--batch-size",
                        "25",
                    ]
                ),
                0,
            )
        run_live.assert_called_once_with(
            tickers=("AAPL", "MSFT"),
            dry_run=True,
            batch_size=25,
            regular_hours_only=True,
        )

    def test_check_live_prices_command_forwards_health_options(self) -> None:
        with patch("pipeline.cli.run_check_live_prices", return_value=0) as run_check:
            self.assertEqual(
                main(
                    [
                        "check-live-prices",
                        "--tickers",
                        "aapl,msft",
                        "--regular-hours-only",
                        "--max-stale-minutes",
                        "3",
                    ]
                ),
                0,
            )
        run_check.assert_called_once_with(
            tickers=("AAPL", "MSFT"),
            max_stale_minutes=3,
            regular_hours_only=True,
        )

    def test_build_features_full_refresh_flag_is_forwarded(self) -> None:
        with patch("pipeline.cli.run_build_features", return_value=0) as run_features:
            self.assertEqual(main(["build-features", "--full-refresh"]), 0)
        run_features.assert_called_once_with(full_refresh=True)

    def test_build_features_builds_rows_without_persisting_them(self) -> None:
        class FakeDatabase:
            def fetch_prices(self):
                return [
                    {"ticker": "AAPL", "date": "2026-01-02", "close": 100.0, "volume": 10},
                    {"ticker": "SPY", "date": "2026-01-02", "close": 500.0, "volume": 10},
                ]

            def upsert_features(self, _rows):
                raise AssertionError("build-features should not persist feature rows")

            def fetch_latest_feature_dates(self, _tickers):
                raise AssertionError("build-features should not read durable feature state")

        with (
            patch(
                "pipeline.commands.ingestion.SupabaseDatabase.from_settings",
                return_value=FakeDatabase(),
            ),
            patch(
                "pipeline.commands.ingestion.build_feature_rows",
                return_value=[{"ticker": "AAPL"}],
            ) as build,
        ):
            self.assertEqual(run_build_features(), 0)

        build.assert_called_once()

    def test_predict_horizons_builds_features_from_prices_without_fetching_features(self) -> None:
        class FakeDatabase:
            def __init__(self) -> None:
                self.prediction_rows: list[dict[str, object]] = []

            def fetch_prices(self):
                return [{"ticker": "AAPL", "date": "2026-01-02", "close": 100.0, "volume": 10}]

            def fetch_latest_fundamentals(self):
                return []

            def fetch_features(self):
                raise AssertionError("predict-horizons should derive features from prices")

            def upsert_predictions(self, rows):
                self.prediction_rows = rows
                return len(rows)

        fake_database = FakeDatabase()
        feature_rows = [{"ticker": "AAPL", "date": "2026-01-02", "feature_json": {}}]
        training_result = SimpleNamespace(
            prediction_rows=[{"prediction_date": "2026-01-02"}],
            skipped=[],
        )

        with (
            patch(
                "pipeline.commands.predictions.SupabaseDatabase.from_settings",
                return_value=fake_database,
            ),
            patch(
                "pipeline.commands.predictions.build_feature_rows", return_value=feature_rows
            ) as build,
            patch(
                "pipeline.commands.predictions.train_and_predict", return_value=training_result
            ) as train,
            patch(
                "pipeline.commands.predictions.generate_warren_buffbot_predictions", return_value=[]
            ),
            patch("pipeline.commands.predictions.generate_timesfm_predictions", return_value=[]),
            patch("pipeline.commands.predictions.generate_chronos_predictions", return_value=[]),
        ):
            self.assertEqual(run_predict_horizons(), 0)

        build.assert_called_once_with(fake_database.fetch_prices())
        train.assert_called_once_with(feature_rows, fake_database.fetch_prices())
        self.assertEqual(fake_database.prediction_rows, training_result.prediction_rows)

    def test_seed_model_predictions_builds_bounded_features_from_prices(self) -> None:
        class FakeDatabase:
            def __init__(self) -> None:
                self.fetch_prices_kwargs: dict[str, object] | None = None

            def fetch_prices(self, **kwargs):
                self.fetch_prices_kwargs = kwargs
                return [{"ticker": "AAPL", "date": "2026-01-02", "close": 100.0, "volume": 10}]

            def fetch_features(self, **_kwargs):
                raise AssertionError("historical seeding should derive features from prices")

            def upsert_predictions(self, _rows):
                raise AssertionError("dry run should not upsert predictions")

        fake_database = FakeDatabase()
        built_rows = [
            {"ticker": "AAPL", "date": "2024-12-31", "feature_json": {}},
            {"ticker": "AAPL", "date": "2025-01-01", "feature_json": {}},
            {"ticker": "AAPL", "date": "2026-07-01", "feature_json": {}},
            {"ticker": "AAPL", "date": "2026-07-02", "feature_json": {}},
        ]

        with (
            patch(
                "pipeline.commands.predictions.SupabaseDatabase.from_settings",
                return_value=fake_database,
            ),
            patch(
                "pipeline.commands.predictions.seed_fetch_start_dates",
                return_value=("2025-01-01", "2024-01-01"),
            ),
            patch(
                "pipeline.commands.predictions.build_feature_rows", return_value=built_rows
            ) as build,
            patch(
                "pipeline.commands.predictions.seed_predictions_for_target_window",
                return_value=SimpleNamespace(prediction_rows=[], skipped=[]),
            ) as seed,
        ):
            self.assertEqual(
                run_seed_model_predictions(
                    target_start="2026-07-01",
                    target_end="2026-07-01",
                    tickers=("AAPL",),
                    model_slugs=("baseline",),
                    dry_run=True,
                ),
                0,
            )

        self.assertEqual(
            fake_database.fetch_prices_kwargs,
            {
                "start_date": "2024-01-01",
                "end_date": "2026-07-01",
                "tickers": ("AAPL", "SPY"),
            },
        )
        build.assert_called_once()
        self.assertEqual(
            seed.call_args.kwargs["feature_rows"],
            [
                {"ticker": "AAPL", "date": "2025-01-01", "feature_json": {}},
                {"ticker": "AAPL", "date": "2026-07-01", "feature_json": {}},
            ],
        )

    def test_bounded_feature_rows_filters_after_building_with_price_lookback(self) -> None:
        built_rows = [
            {"ticker": "AAPL", "date": "2024-12-31"},
            {"ticker": "AAPL", "date": "2025-01-01"},
            {"ticker": "AAPL", "date": "2026-07-01"},
            {"ticker": "AAPL", "date": "2026-07-02"},
        ]

        with patch("pipeline.commands.predictions.build_feature_rows", return_value=built_rows):
            rows = _bounded_feature_rows_from_prices(
                [{"ticker": "AAPL"}],
                start_date="2025-01-01",
                end_date="2026-07-01",
            )

        self.assertEqual(rows, built_rows[1:3])

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
            patch(
                "pipeline.cli.run_build_features",
                side_effect=AssertionError("run-daily must not rebuild and discard features"),
            ),
            patch("pipeline.cli.run_score", side_effect=record("score")),
            patch("pipeline.cli.run_predict_horizons", side_effect=record("predict")),
            patch(
                "pipeline.cli.run_refresh_and_export_dashboard",
                side_effect=record("publish"),
            ),
            patch(
                "pipeline.cli.run_refresh_dashboard",
                side_effect=AssertionError("run-daily must use the combined dashboard path"),
            ),
            patch("pipeline.cli.run_prune_engagement_events", side_effect=record("prune")),
            patch(
                "pipeline.cli.run_export_snapshot",
                side_effect=AssertionError("run-daily must use the combined dashboard path"),
            ),
        ):
            self.assertEqual(main(["run-daily"]), 0)

        self.assertEqual(
            calls,
            [
                "prices",
                "fundamentals",
                "logos",
                "score",
                "predict",
                "publish",
                "prune",
            ],
        )

    def test_run_daily_can_skip_price_ingestion_for_split_workflow(self) -> None:
        calls: list[str] = []

        def record(name: str):
            def _inner(*_args: object, **_kwargs: object) -> int:
                calls.append(name)
                return 0

            return _inner

        with (
            patch("pipeline.cli.run_ingest_latest_prices", side_effect=record("prices")),
            patch("pipeline.cli.run_ingest_fundamentals", side_effect=record("fundamentals")),
            patch("pipeline.cli.run_ingest_logos", return_value=0),
            patch(
                "pipeline.cli.run_build_features",
                side_effect=AssertionError("run-daily must not rebuild and discard features"),
            ),
            patch("pipeline.cli.run_score", return_value=0),
            patch("pipeline.cli.run_predict_horizons", return_value=0),
            patch("pipeline.cli.run_refresh_and_export_dashboard", return_value=0),
            patch("pipeline.cli.run_prune_engagement_events", return_value=0),
        ):
            self.assertEqual(main(["run-daily", "--skip-price-ingestion"]), 0)

        self.assertEqual(calls, ["fundamentals"])

    def test_live_price_health_passes_for_fresh_regular_snapshots(self) -> None:
        now = datetime(2026, 6, 29, 14, 35, tzinfo=UTC)
        rows = [
            {
                "ticker": "AAPL",
                "market_state": "regular",
                "as_of": (now - timedelta(minutes=1)).isoformat(),
                "stale_after": (now + timedelta(minutes=1)).isoformat(),
            }
        ]

        self.assertEqual(
            _report_live_price_health(
                rows,
                expected_tickers=("AAPL",),
                max_stale_minutes=5,
                require_regular=True,
                now=now,
            ),
            0,
        )

    def test_live_price_health_fails_for_stale_regular_hour_snapshots(self) -> None:
        now = datetime(2026, 6, 29, 14, 35, tzinfo=UTC)
        rows = [
            {
                "ticker": "AAPL",
                "market_state": "closed",
                "as_of": (now - timedelta(days=3)).isoformat(),
                "stale_after": (now - timedelta(days=3)).isoformat(),
            }
        ]

        self.assertEqual(
            _report_live_price_health(
                rows,
                expected_tickers=("AAPL",),
                max_stale_minutes=5,
                require_regular=True,
                now=now,
            ),
            1,
        )


if __name__ == "__main__":
    unittest.main()
