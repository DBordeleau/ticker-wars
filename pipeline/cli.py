from __future__ import annotations

import argparse
import logging

from pipeline.config import load_settings
from pipeline.dates import parse_date
from pipeline.db import SupabaseDatabase
from pipeline.evaluation.metrics import calculate_model_metrics
from pipeline.evaluation.scoring import score_matured_predictions
from pipeline.features.build_features import build_feature_rows
from pipeline.ingestion.market_data import fetch_daily_prices
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

    if args.command == "train-predict":
        return run_train_predict()

    if args.command == "score":
        return run_score()

    if args.command == "run-daily":
        settings = load_settings()
        backfill_status = run_backfill(settings.start_date)
        if backfill_status != 0:
            return backfill_status
        feature_status = run_build_features()
        if feature_status != 0:
            return feature_status
        score_status = run_score()
        if score_status != 0:
            return score_status
        return run_train_predict()

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
    if not feature_rows or not price_rows:
        LOGGER.warning("Model training skipped because features or prices are missing.")
        return 0

    training_result = train_and_predict(feature_rows, price_rows)
    buffbot_rows = generate_warren_buffbot_predictions(feature_rows, price_rows, settings)
    prediction_rows = training_result.prediction_rows + buffbot_rows
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


if __name__ == "__main__":
    raise SystemExit(main())
