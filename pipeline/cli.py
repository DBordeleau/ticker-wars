from __future__ import annotations

import argparse
import logging
import sys

from pipeline.commands.benchmark import (
    DEFAULT_ADAPTER_TICKERS,
    DEFAULT_PRICE_DAYS,
    DEFAULT_RUNTIME_BENCHMARK_PATH,
    DEFAULT_SIMPLE_TICKERS,
    run_benchmark_runtime,
)
from pipeline.commands.common import (
    daily_prediction_tickers as _daily_prediction_tickers,
)
from pipeline.commands.common import (
    daily_price_tickers as _daily_price_tickers,
)
from pipeline.commands.common import (
    parse_ticker_arg as _parse_ticker_arg,
)
from pipeline.commands.dashboard import (
    build_dashboard_tables_from_database,
    run_export_snapshot,
    run_refresh_dashboard,
)
from pipeline.commands.ingestion import (
    run_backfill,
    run_build_features,
    run_ingest_fundamentals,
    run_ingest_latest_prices,
    run_ingest_logos,
    run_prune_engagement_events,
)
from pipeline.commands.live_prices import (
    build_live_price_fetch_event as _build_live_price_fetch_event,
)
from pipeline.commands.live_prices import (
    parse_timestamp as _parse_timestamp,
)
from pipeline.commands.live_prices import (
    report_live_price_health as _report_live_price_health,
)
from pipeline.commands.live_prices import (
    run_check_live_prices,
    run_refresh_live_prices,
)
from pipeline.commands.live_prices import (
    utc_now as _utc_now,
)
from pipeline.commands.predictions import (
    bounded_feature_rows_from_prices as _bounded_feature_rows_from_prices,
)
from pipeline.commands.predictions import (
    run_predict_horizons,
    run_seed_model_predictions,
)
from pipeline.commands.predictions import (
    seed_fetch_start_dates as _seed_fetch_start_dates,
)
from pipeline.commands.scoring import run_score
from pipeline.config import load_settings
from pipeline.models.historical import normalize_model_slugs

LOGGER = logging.getLogger(__name__)

__all__ = [
    "_bounded_feature_rows_from_prices",
    "_build_live_price_fetch_event",
    "_daily_prediction_tickers",
    "_daily_price_tickers",
    "_parse_ticker_arg",
    "_parse_timestamp",
    "_report_live_price_health",
    "_seed_fetch_start_dates",
    "_utc_now",
    "build_dashboard_tables_from_database",
    "build_parser",
    "main",
    "run_backfill",
    "run_benchmark_runtime",
    "run_build_features",
    "run_check_live_prices",
    "run_export_snapshot",
    "run_ingest_fundamentals",
    "run_ingest_latest_prices",
    "run_ingest_logos",
    "run_placeholder_step",
    "run_predict_horizons",
    "run_prune_engagement_events",
    "run_refresh_dashboard",
    "run_refresh_live_prices",
    "run_score",
    "run_seed_model_predictions",
    "run_train_predict_alias",
]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline.cli",
        description="Run the Ticker Wars prediction pipeline.",
    )
    parser.add_argument("--log-level", default="INFO", help="Python logging level.")

    subparsers = parser.add_subparsers(dest="command")

    backfill = subparsers.add_parser("backfill", help="Backfill historical OHLCV data.")
    backfill.add_argument("--start", default=None, help="Start date in YYYY-MM-DD format.")
    backfill.add_argument("--end", default=None, help="Optional end date in YYYY-MM-DD format.")

    ingest_prices = subparsers.add_parser(
        "ingest-prices",
        help="Alias for backfill; ingest historical OHLCV data.",
    )
    ingest_prices.add_argument("--start", default=None, help="Start date in YYYY-MM-DD format.")
    ingest_prices.add_argument(
        "--end",
        default=None,
        help="Optional end date in YYYY-MM-DD format.",
    )
    subparsers.add_parser(
        "ingest-latest-prices",
        help="Fetch only missing/recent OHLCV bars since the latest stored price dates.",
    )
    live_prices = subparsers.add_parser(
        "refresh-live-prices",
        help="Fetch current-ish quote snapshots and current-session intraday bars.",
    )
    live_prices.add_argument(
        "--tickers",
        default=None,
        help="Optional comma-separated ticker list. Defaults to the prediction universe.",
    )
    live_prices.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and log live price rows without writing to Supabase.",
    )
    live_prices.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Provider batch size for live price fetches.",
    )
    live_prices.add_argument(
        "--regular-hours-only",
        action="store_true",
        help="Skip refresh unless current ET time is within the regular market session.",
    )
    live_health = subparsers.add_parser(
        "check-live-prices",
        help="Check whether cached live prices are fresh enough for market-hours UI use.",
    )
    live_health.add_argument(
        "--tickers",
        default=None,
        help="Optional comma-separated ticker list. Defaults to the prediction universe.",
    )
    live_health.add_argument(
        "--max-stale-minutes",
        type=int,
        default=5,
        help="Maximum allowed snapshot age during regular-market checks.",
    )
    live_health.add_argument(
        "--regular-hours-only",
        action="store_true",
        help="Skip the health check unless current ET time is within the regular session.",
    )

    fundamentals = subparsers.add_parser(
        "ingest-fundamentals",
        help="Fetch and upsert cached yfinance fundamentals.",
    )
    fundamentals.add_argument(
        "--force",
        action="store_true",
        help="Refresh fundamentals even when cached rows are still fresh.",
    )
    logos = subparsers.add_parser(
        "ingest-logos",
        help="Fetch and cache ticker logos from Hunter using yfinance website domains.",
    )
    logos.add_argument(
        "--force",
        action="store_true",
        help="Refresh logos even when cached rows already exist.",
    )

    run_daily = subparsers.add_parser("run-daily", help="Run the daily pipeline.")
    run_daily.add_argument(
        "--skip-price-ingestion",
        action="store_true",
        help="Run downstream daily steps after a separate price-ingestion job.",
    )
    prune_engagement = subparsers.add_parser(
        "prune-engagement-events",
        help="Delete old engagement events that have already been seen in all relevant surfaces.",
    )
    prune_engagement.add_argument(
        "--seen-days",
        type=int,
        default=90,
        help="Retain fully seen engagement events for this many days.",
    )
    build_features = subparsers.add_parser(
        "build-features",
        help="Build derived feature rows from prices without writing them.",
    )
    build_features.add_argument(
        "--full-refresh",
        action="store_true",
        help="Compatibility flag; feature rows are derived from prices and are not persisted.",
    )
    subparsers.add_parser(
        "predict-horizons",
        help="Train enabled models and upsert horizon-aware predictions.",
    )
    seed_predictions = subparsers.add_parser(
        "seed-model-predictions",
        help="Generate historical as-of model predictions for a target-date window.",
    )
    seed_predictions.add_argument(
        "--target-start",
        required=True,
        help="First target date to seed in YYYY-MM-DD format.",
    )
    seed_predictions.add_argument(
        "--target-end",
        required=True,
        help="Last target date to seed in YYYY-MM-DD format.",
    )
    seed_predictions.add_argument(
        "--tickers",
        default=None,
        help="Optional comma-separated ticker list. Defaults to the prediction universe.",
    )
    seed_predictions.add_argument(
        "--models",
        default=None,
        help=(
            "Optional comma-separated model slugs/names. Defaults to baseline, "
            "linear-regression, random-forest, TimesFM if enabled, and Chronos-2 if enabled."
        ),
    )
    seed_predictions.add_argument(
        "--dry-run",
        action="store_true",
        help="Log expected writes without upserting predictions.",
    )
    seed_predictions.add_argument(
        "--include-latest",
        action="store_true",
        help="Run the normal latest-as-of predict-horizons step after seeding.",
    )
    subparsers.add_parser("score", help="Score matured predictions.")
    subparsers.add_parser("refresh-dashboard", help="Refresh dashboard tables.")
    subparsers.add_parser("export-snapshot", help="Export dashboard JSON snapshots.")
    subparsers.add_parser("export-snapshots", help="Alias for export-snapshot.")

    benchmark = subparsers.add_parser(
        "benchmark-runtime",
        help="Run local runtime benchmarks for simple and optional heavy models.",
    )
    benchmark.add_argument("--output", default=DEFAULT_RUNTIME_BENCHMARK_PATH)
    benchmark.add_argument("--simple-tickers", type=int, default=DEFAULT_SIMPLE_TICKERS)
    benchmark.add_argument("--adapter-tickers", type=int, default=DEFAULT_ADAPTER_TICKERS)
    benchmark.add_argument("--price-days", type=int, default=DEFAULT_PRICE_DAYS)
    benchmark.add_argument("--include-timesfm", action="store_true")
    benchmark.add_argument("--include-chronos", action="store_true")

    return parser


def run_placeholder_step(name: str) -> int:
    settings = load_settings()
    LOGGER.info("%s is scaffolded. Data source: %s", name, settings.market_data_source)
    return 0


def run_train_predict_alias() -> int:
    LOGGER.warning("train-predict is deprecated; use predict-horizons instead.")
    return run_predict_horizons()


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    used_deprecated_train_predict = "train-predict" in raw_argv
    normalized_argv = ["predict-horizons" if arg == "train-predict" else arg for arg in raw_argv]

    parser = build_parser()
    args = parser.parse_args(normalized_argv)
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))
    logging.getLogger("httpx").setLevel(logging.WARNING)

    if args.command is None:
        parser.print_help()
        return 0

    if args.command in {"backfill", "ingest-prices"}:
        start = args.start or load_settings().start_date
        return run_backfill(start, args.end)

    if args.command == "ingest-latest-prices":
        return run_ingest_latest_prices()

    if args.command == "prune-engagement-events":
        return run_prune_engagement_events(seen_days=args.seen_days)

    if args.command == "refresh-live-prices":
        return run_refresh_live_prices(
            tickers=_parse_ticker_arg(args.tickers),
            dry_run=args.dry_run,
            batch_size=args.batch_size,
            regular_hours_only=args.regular_hours_only,
        )

    if args.command == "check-live-prices":
        return run_check_live_prices(
            tickers=_parse_ticker_arg(args.tickers),
            max_stale_minutes=args.max_stale_minutes,
            regular_hours_only=args.regular_hours_only,
        )

    if args.command == "build-features":
        return run_build_features(full_refresh=args.full_refresh)

    if args.command == "ingest-fundamentals":
        return run_ingest_fundamentals(force=args.force)

    if args.command == "ingest-logos":
        return run_ingest_logos(force=args.force)

    if args.command == "predict-horizons":
        if used_deprecated_train_predict:
            return run_train_predict_alias()
        return run_predict_horizons()

    if args.command == "seed-model-predictions":
        return run_seed_model_predictions(
            target_start=args.target_start,
            target_end=args.target_end,
            tickers=_parse_ticker_arg(args.tickers),
            model_slugs=normalize_model_slugs(args.models),
            dry_run=args.dry_run,
            include_latest=args.include_latest,
        )

    if args.command == "score":
        return run_score()

    if args.command == "refresh-dashboard":
        return run_refresh_dashboard()

    if args.command in {"export-snapshot", "export-snapshots"}:
        return run_export_snapshot()

    if args.command == "benchmark-runtime":
        return run_benchmark_runtime(
            output_path=args.output,
            simple_ticker_count=args.simple_tickers,
            adapter_ticker_count=args.adapter_tickers,
            price_days=args.price_days,
            include_timesfm=args.include_timesfm,
            include_chronos=args.include_chronos,
        )

    if args.command == "run-daily":
        if not args.skip_price_ingestion:
            price_status = run_ingest_latest_prices()
            if price_status != 0:
                return price_status
        fundamentals_status = run_ingest_fundamentals()
        if fundamentals_status != 0:
            return fundamentals_status
        logos_status = run_ingest_logos()
        if logos_status != 0:
            return logos_status
        score_status = run_score()
        if score_status != 0:
            return score_status
        prediction_status = run_predict_horizons()
        if prediction_status != 0:
            return prediction_status
        refresh_status = run_refresh_dashboard()
        if refresh_status != 0:
            return refresh_status
        prune_status = run_prune_engagement_events()
        if prune_status != 0:
            return prune_status
        return run_export_snapshot()

    return run_placeholder_step(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
