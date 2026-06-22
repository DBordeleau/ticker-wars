from __future__ import annotations

import argparse
import logging
from typing import Any

from pipeline.config import load_settings
from pipeline.dashboard.refresh import build_dashboard_tables
from pipeline.dashboard.snapshot_export import export_dashboard_snapshots
from pipeline.dates import parse_date
from pipeline.db import SupabaseDatabase
from pipeline.evaluation.metrics import calculate_model_metrics
from pipeline.evaluation.scoring import score_matured_predictions
from pipeline.features.build_features import build_feature_rows
from pipeline.ingestion.fundamentals import fetch_fundamentals
from pipeline.ingestion.market_data import fetch_daily_prices
from pipeline.models.chronos_model import generate_chronos_predictions
from pipeline.models.timesfm_model import generate_timesfm_predictions
from pipeline.models.training import train_and_predict
from pipeline.models.warren_buffbot import generate_warren_buffbot_predictions

LOGGER = logging.getLogger(__name__)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pipeline.cli",
        description="Run the next-day price prediction pipeline.",
    )
    parser.add_argument("--log-level", default="INFO", help="Python logging level.")

    subparsers = parser.add_subparsers(dest="command")

    backfill = subparsers.add_parser("backfill", help="Backfill historical OHLCV data.")
    backfill.add_argument("--start", default=None, help="Start date in YYYY-MM-DD format.")
    backfill.add_argument("--end", default=None, help="Optional end date in YYYY-MM-DD format.")

    fundamentals = subparsers.add_parser(
        "ingest-fundamentals",
        help="Fetch and upsert cached yfinance fundamentals.",
    )
    fundamentals.add_argument(
        "--force",
        action="store_true",
        help="Refresh fundamentals even when cached rows are still fresh.",
    )

    subparsers.add_parser("run-daily", help="Run the daily pipeline.")
    subparsers.add_parser("build-features", help="Build and upsert feature rows from prices.")
    subparsers.add_parser("train-predict", help="Train models and upsert next-day predictions.")
    subparsers.add_parser("score", help="Score matured predictions.")
    subparsers.add_parser("refresh-dashboard", help="Refresh dashboard tables.")
    subparsers.add_parser("export-snapshot", help="Export dashboard JSON snapshots.")

    return parser


def run_placeholder_step(name: str) -> int:
    settings = load_settings()
    LOGGER.info("%s is scaffolded. Data source: %s", name, settings.market_data_source)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(level=getattr(logging, args.log_level.upper(), logging.INFO))
    logging.getLogger("httpx").setLevel(logging.WARNING)

    if args.command is None:
        parser.print_help()
        return 0

    if args.command == "backfill":
        start = args.start or load_settings().start_date
        return run_backfill(start, args.end)

    if args.command == "build-features":
        return run_build_features()

    if args.command == "ingest-fundamentals":
        return run_ingest_fundamentals(force=args.force)

    if args.command == "train-predict":
        return run_train_predict()

    if args.command == "score":
        return run_score()

    if args.command == "refresh-dashboard":
        return run_refresh_dashboard()

    if args.command == "export-snapshot":
        return run_export_snapshot()

    if args.command == "run-daily":
        settings = load_settings()
        backfill_status = run_backfill(settings.start_date)
        if backfill_status != 0:
            return backfill_status
        fundamentals_status = run_ingest_fundamentals()
        if fundamentals_status != 0:
            return fundamentals_status
        feature_status = run_build_features()
        if feature_status != 0:
            return feature_status
        score_status = run_score()
        if score_status != 0:
            return score_status
        train_status = run_train_predict()
        if train_status != 0:
            return train_status
        return run_refresh_dashboard()

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


def run_build_features() -> int:
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
    written = database.upsert_features(feature_rows)
    LOGGER.info("Feature generation wrote %s feature rows.", written)
    return 0


def run_train_predict() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Model training skipped because Supabase credentials are not configured.")
        return 0

    feature_rows = database.fetch_features()
    price_rows = database.fetch_prices()
    fundamental_rows = database.fetch_latest_fundamentals()
    if not feature_rows or not price_rows:
        LOGGER.warning("Model training skipped because features or prices are missing.")
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

    LOGGER.info("Model training wrote %s predictions.", written)
    if training_result.skipped:
        LOGGER.warning(
            "Model training skipped %s model/ticker pairs.",
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
    price_rows = database.fetch_prices()
    if not prediction_rows or not price_rows:
        LOGGER.warning("Prediction scoring skipped because predictions or prices are missing.")
        return 0

    score_rows = score_matured_predictions(prediction_rows, price_rows)
    written = database.upsert_prediction_scores(score_rows)
    metrics = calculate_model_metrics(score_rows)

    LOGGER.info("Prediction scoring wrote %s score rows.", written)
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


def build_dashboard_tables_from_database(
    database: SupabaseDatabase,
) -> dict[str, list[dict[str, Any]]]:
    settings = load_settings()
    return build_dashboard_tables(
        prediction_rows=database.fetch_predictions(),
        score_rows=database.fetch_prediction_scores(),
        price_rows=database.fetch_prices(),
        settings=settings,
    )


if __name__ == "__main__":
    raise SystemExit(main())
