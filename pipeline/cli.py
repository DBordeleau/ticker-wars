from __future__ import annotations

import argparse
import logging

from pipeline.config import load_settings
from pipeline.dates import parse_date
from pipeline.db import SupabaseDatabase
from pipeline.features.build_features import build_feature_rows
from pipeline.ingestion.market_data import fetch_daily_prices

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

    if args.command == "run-daily":
        settings = load_settings()
        backfill_status = run_backfill(settings.start_date)
        if backfill_status != 0:
            return backfill_status
        return run_build_features()

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


if __name__ == "__main__":
    raise SystemExit(main())
