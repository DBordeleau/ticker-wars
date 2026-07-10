from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from pipeline.commands.common import daily_price_tickers
from pipeline.config import load_settings
from pipeline.dates import parse_date
from pipeline.db import SupabaseDatabase
from pipeline.features.build_features import build_feature_rows
from pipeline.ingestion.fundamentals import fetch_fundamentals
from pipeline.ingestion.logos import fetch_ticker_logos
from pipeline.ingestion.market_data import fetch_daily_prices, fetch_incremental_daily_prices

LOGGER = logging.getLogger(__name__)


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

    tickers = daily_price_tickers()
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


def run_prune_engagement_events(seen_days: int = 90) -> int:
    if seen_days < 1:
        LOGGER.error("--seen-days must be at least 1.")
        return 1

    database = SupabaseDatabase.from_settings()
    if database is None:
        LOGGER.info(
            "Engagement event pruning skipped because Supabase credentials are not configured."
        )
        return 0

    seen_before = (datetime.now(UTC) - timedelta(days=seen_days)).isoformat()
    pruned = database.prune_user_engagement_events(seen_before)
    LOGGER.info(
        "Pruned %s fully seen engagement events older than %s days.",
        pruned,
        seen_days,
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
    if full_refresh:
        LOGGER.info(
            "Feature generation built %s feature rows; no rows were written because "
            "features are derived from prices.",
            len(feature_rows),
        )
    else:
        LOGGER.info(
            "Feature generation built %s feature rows from prices; no Supabase writes "
            "were performed.",
            len(feature_rows),
        )
    return 0
