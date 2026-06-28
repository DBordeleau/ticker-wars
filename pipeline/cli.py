from __future__ import annotations

import argparse
import logging
import sys
from datetime import timedelta
from typing import Any

from pipeline.benchmarking.runtime import (
    DEFAULT_ADAPTER_TICKERS,
    DEFAULT_PRICE_DAYS,
    DEFAULT_RUNTIME_BENCHMARK_PATH,
    DEFAULT_SIMPLE_TICKERS,
    run_runtime_benchmark,
    write_runtime_benchmark,
)
from pipeline.config import load_settings
from pipeline.dashboard.refresh import build_dashboard_tables
from pipeline.dashboard.snapshot_export import export_dashboard_snapshots
from pipeline.dates import parse_date
from pipeline.db import SupabaseDatabase
from pipeline.evaluation.metrics import calculate_model_metrics
from pipeline.evaluation.scoring import (
    score_matured_predictions,
    score_matured_user_predictions,
)
from pipeline.features.build_features import MARKET_TICKERS, build_feature_rows
from pipeline.ingestion.fundamentals import fetch_fundamentals
from pipeline.ingestion.logos import fetch_ticker_logos
from pipeline.ingestion.market_data import fetch_daily_prices, fetch_incremental_daily_prices
from pipeline.ingestion.ticker_universe import MVP_TICKERS
from pipeline.models.chronos_model import generate_chronos_predictions
from pipeline.models.timesfm_model import generate_timesfm_predictions
from pipeline.models.training import train_and_predict
from pipeline.models.warren_buffbot import generate_warren_buffbot_predictions

LOGGER = logging.getLogger(__name__)


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

    subparsers.add_parser("run-daily", help="Run the daily pipeline.")
    build_features = subparsers.add_parser(
        "build-features",
        help="Build and upsert feature rows from prices.",
    )
    build_features.add_argument(
        "--full-refresh",
        action="store_true",
        help="Upsert every feature row instead of only the recent refresh window.",
    )
    subparsers.add_parser(
        "predict-horizons",
        help="Train enabled models and upsert horizon-aware predictions.",
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


def main(argv: list[str] | None = None) -> int:
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    used_deprecated_train_predict = "train-predict" in raw_argv
    normalized_argv = [
        "predict-horizons" if arg == "train-predict" else arg for arg in raw_argv
    ]

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
        price_status = run_ingest_latest_prices()
        if price_status != 0:
            return price_status
        fundamentals_status = run_ingest_fundamentals()
        if fundamentals_status != 0:
            return fundamentals_status
        logos_status = run_ingest_logos()
        if logos_status != 0:
            return logos_status
        feature_status = run_build_features()
        if feature_status != 0:
            return feature_status
        score_status = run_score()
        if score_status != 0:
            return score_status
        prediction_status = run_predict_horizons()
        if prediction_status != 0:
            return prediction_status
        refresh_status = run_refresh_dashboard()
        if refresh_status != 0:
            return refresh_status
        return run_export_snapshot()

    return run_placeholder_step(args.command)


def run_backfill(start_date: str, end_date: str | None = None) -> int:
    parse_date(start_date)
    if end_date is not None:
        parse_date(end_date)

    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Backfill skipped because Supabase credentials are not configured.")
        return 0

    result = fetch_daily_prices(start_date=start_date, end_date=end_date)
    written = database.upsert_prices(result.rows)

    LOGGER.info("Backfill wrote %s price rows.", written)
    if result.failed_tickers:
        LOGGER.warning(
            "Backfill skipped %s tickers: %s",
            len(result.failed_tickers),
            result.failed_tickers,
        )

    return 0


def run_ingest_latest_prices() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Latest price ingestion skipped because Supabase credentials are not configured."
        )
        return 0

    tickers = _daily_price_tickers()
    latest_dates = database.fetch_latest_price_dates(tickers)
    result = fetch_incremental_daily_prices(
        start_date=settings.start_date,
        latest_dates=latest_dates,
        tickers=tickers,
    )
    written = database.upsert_prices(result.rows)

    LOGGER.info("Latest price ingestion wrote %s price rows.", written)
    if result.skipped_tickers:
        LOGGER.info(
            "Latest price ingestion skipped %s tickers already current for the requested window.",
            len(result.skipped_tickers),
        )
    if result.failed_tickers:
        LOGGER.warning(
            "Latest price ingestion failed for %s tickers: %s",
            len(result.failed_tickers),
            result.failed_tickers,
        )

    return 0


def run_ingest_fundamentals(force: bool = False) -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Fundamentals ingestion skipped because Supabase credentials are not configured."
        )
        return 0

    existing_rows = database.fetch_latest_fundamentals()
    result = fetch_fundamentals(existing_rows=existing_rows, force=force)
    written = database.upsert_fundamentals(result.rows)

    LOGGER.info("Fundamentals ingestion wrote %s rows.", written)
    if result.skipped_tickers:
        LOGGER.info(
            "Fundamentals ingestion used cached rows for %s tickers.",
            len(result.skipped_tickers),
        )
    if result.failed_tickers:
        LOGGER.warning(
            "Fundamentals ingestion failed for %s tickers: %s",
            len(result.failed_tickers),
            result.failed_tickers,
        )

    return 0


def run_ingest_logos(force: bool = False) -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Logo ingestion skipped because Supabase credentials are not configured.")
        return 0

    fundamental_rows = database.fetch_latest_fundamentals()
    if not fundamental_rows:
        LOGGER.warning("Logo ingestion skipped because fundamentals are not available.")
        return 0

    existing_rows = database.fetch_ticker_assets()
    result = fetch_ticker_logos(
        fundamental_rows=fundamental_rows,
        existing_rows=existing_rows,
        force=force,
    )
    written = database.upsert_ticker_assets(result.rows)

    LOGGER.info("Logo ingestion wrote %s cached ticker assets.", written)
    if result.skipped_tickers:
        LOGGER.info("Logo ingestion used cached rows for %s tickers.", len(result.skipped_tickers))
    if result.failed_tickers:
        LOGGER.warning(
            "Logo ingestion failed for %s tickers: %s",
            len(result.failed_tickers),
            result.failed_tickers,
        )

    return 0


def run_build_features(full_refresh: bool = False) -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Feature generation skipped because Supabase credentials are not configured.")
        return 0

    price_rows = database.fetch_prices()
    if not price_rows:
        LOGGER.warning("Feature generation skipped because the prices table is empty.")
        return 0

    if not any(row.get("ticker") == "SPY" for row in price_rows):
        LOGGER.info(
            "SPY prices not found locally; fetching market index data for feature generation."
        )
        market_result = fetch_daily_prices(start_date=settings.start_date, tickers=("SPY",))
        price_rows.extend(market_result.rows)
        if market_result.failed_tickers:
            LOGGER.warning("Market index fetch failed; feature generation skipped.")
            return 0

    feature_rows = build_feature_rows(price_rows)
    total_feature_rows = len(feature_rows)
    if not full_refresh:
        latest_feature_dates = database.fetch_latest_feature_dates(_daily_prediction_tickers())
        feature_rows = _feature_rows_for_incremental_upsert(feature_rows, latest_feature_dates)
    written = database.upsert_features(feature_rows)
    if full_refresh:
        LOGGER.info("Feature generation wrote %s feature rows.", written)
    else:
        LOGGER.info(
            "Feature generation wrote %s recent feature rows out of %s built rows.",
            written,
            total_feature_rows,
        )
    return 0


def run_train_predict_alias() -> int:
    LOGGER.warning("train-predict is deprecated; use predict-horizons instead.")
    return run_predict_horizons()


def run_predict_horizons() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Prediction generation skipped because Supabase credentials are not configured."
        )
        return 0

    feature_rows = database.fetch_features()
    price_rows = database.fetch_prices()
    fundamental_rows = database.fetch_latest_fundamentals()
    if not feature_rows or not price_rows:
        LOGGER.warning("Prediction generation skipped because features or prices are missing.")
        return 0

    training_result = train_and_predict(feature_rows, price_rows)
    buffbot_rows = generate_warren_buffbot_predictions(
        feature_rows,
        price_rows,
        settings,
        fundamental_rows,
    )
    timesfm_rows = generate_timesfm_predictions(price_rows, settings)
    chronos_rows = generate_chronos_predictions(price_rows, settings)
    prediction_rows = training_result.prediction_rows + buffbot_rows + timesfm_rows + chronos_rows
    written = database.upsert_predictions(prediction_rows)

    LOGGER.info("Prediction generation wrote %s predictions.", written)
    latest_prediction_date = max(
        (str(row["prediction_date"]) for row in prediction_rows),
        default=None,
    )
    if latest_prediction_date is not None:
        LOGGER.info("Latest prediction date: %s", latest_prediction_date)
    if training_result.skipped:
        LOGGER.warning(
            "Prediction generation skipped %s model/ticker pairs.",
            len(training_result.skipped),
        )
        for message in training_result.skipped[:10]:
            LOGGER.warning(message)
        if len(training_result.skipped) > 10:
            LOGGER.warning("...and %s more skips.", len(training_result.skipped) - 10)

    return 0


def run_score() -> int:
    database = SupabaseDatabase.from_settings()
    if database is None:
        LOGGER.info("Prediction scoring skipped because Supabase credentials are not configured.")
        return 0

    prediction_rows = database.fetch_predictions()
    user_prediction_rows = database.fetch_user_predictions(status="pending")
    price_rows = database.fetch_prices()
    if not price_rows:
        LOGGER.warning("Prediction scoring skipped because prices are missing.")
        return 0

    score_rows = score_matured_predictions(prediction_rows, price_rows)
    written = database.upsert_prediction_scores(score_rows)
    metrics = calculate_model_metrics(score_rows)
    user_score_rows = score_matured_user_predictions(user_prediction_rows, price_rows)
    user_written = database.upsert_user_prediction_scores(user_score_rows)
    database.mark_user_predictions_scored(
        [str(row["prediction_id"]) for row in user_score_rows],
    )

    LOGGER.info("Prediction scoring wrote %s scored predictions.", written)
    LOGGER.info("User prediction scoring wrote %s scored predictions.", user_written)
    latest_scored_target_date = max(
        (str(row["target_date"]) for row in score_rows + user_score_rows),
        default=None,
    )
    if latest_scored_target_date is not None:
        LOGGER.info("Latest scored target date: %s", latest_scored_target_date)
    LOGGER.info("Calculated %s model metric rows for this scoring batch.", len(metrics))
    return 0


def run_refresh_dashboard() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Dashboard refresh skipped because Supabase credentials are not configured.")
        return 0

    dashboard_tables = build_dashboard_tables_from_database(database)

    for table_name, rows in dashboard_tables.items():
        written = database.replace_dashboard_table(table_name, rows)
        LOGGER.info("Refreshed %s with %s rows.", table_name, written)

    return 0


def run_export_snapshot() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Snapshot export skipped because Supabase credentials are not configured.")
        return 0

    dashboard_tables = build_dashboard_tables_from_database(database)
    counts = export_dashboard_snapshots(dashboard_tables, settings.export_dir)
    for filename, count in counts.items():
        LOGGER.info("Exported %s with %s rows.", filename, count)

    return 0


def run_benchmark_runtime(
    *,
    output_path: str = DEFAULT_RUNTIME_BENCHMARK_PATH,
    simple_ticker_count: int = DEFAULT_SIMPLE_TICKERS,
    adapter_ticker_count: int = DEFAULT_ADAPTER_TICKERS,
    price_days: int = DEFAULT_PRICE_DAYS,
    include_timesfm: bool = False,
    include_chronos: bool = False,
) -> int:
    settings = load_settings()
    report = run_runtime_benchmark(
        settings=settings,
        simple_ticker_count=simple_ticker_count,
        adapter_ticker_count=adapter_ticker_count,
        price_days=price_days,
        include_timesfm=include_timesfm,
        include_chronos=include_chronos,
    )
    path = write_runtime_benchmark(report, output_path)
    LOGGER.info("Runtime benchmark report written to %s.", path)

    for benchmark in report["benchmarks"]:
        LOGGER.info(
            "%s: %s, cold=%s, warm=%s, predictions=%s",
            benchmark["name"],
            benchmark["status"],
            benchmark["cold_seconds"],
            benchmark["warm_seconds"],
            benchmark["prediction_count"],
        )

    LOGGER.info("Automation recommendation: %s", report["automation_recommendation"])
    return 0


def build_dashboard_tables_from_database(
    database: SupabaseDatabase,
) -> dict[str, list[dict[str, Any]]]:
    settings = load_settings()
    return build_dashboard_tables(
        prediction_rows=database.fetch_predictions(),
        score_rows=database.fetch_prediction_scores(),
        price_rows=database.fetch_prices(),
        user_prediction_rows=database.fetch_user_predictions(),
        user_score_rows=database.fetch_user_prediction_scores(),
        user_profile_rows=database.fetch_user_profiles(),
        settings=settings,
    )


def _daily_price_tickers() -> tuple[str, ...]:
    return tuple(dict.fromkeys((*MVP_TICKERS, *MARKET_TICKERS)))


def _daily_prediction_tickers() -> tuple[str, ...]:
    return MVP_TICKERS


def _feature_rows_for_incremental_upsert(
    feature_rows: list[dict[str, Any]],
    latest_feature_dates: dict[str, str],
    lookback_days: int = 430,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in feature_rows:
        ticker = str(row.get("ticker", ""))
        latest_feature_date = latest_feature_dates.get(ticker)
        if latest_feature_date is None:
            rows.append(row)
            continue

        refresh_start = parse_date(latest_feature_date) - timedelta(days=lookback_days)
        if parse_date(str(row["date"])) >= refresh_start:
            rows.append(row)

    return rows


if __name__ == "__main__":
    raise SystemExit(main())
