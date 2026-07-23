from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from pipeline.commands.common import daily_prediction_tickers
from pipeline.config import Settings, load_settings
from pipeline.dates import parse_date
from pipeline.db import SupabaseDatabase
from pipeline.features.build_features import build_feature_rows
from pipeline.models.chronos_model import generate_chronos_predictions
from pipeline.models.historical import seed_predictions_for_target_window
from pipeline.models.timesfm_model import generate_timesfm_predictions
from pipeline.models.training import train_and_predict
from pipeline.models.warren_buffbot import generate_warren_buffbot_predictions

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class PredictionResult:
    prediction_rows: list[dict[str, Any]]


def run_predict_horizons() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Prediction generation skipped because Supabase credentials are not configured."
        )
        return 0

    price_rows = database.fetch_prices()
    fundamental_rows = database.fetch_latest_fundamentals() if price_rows else []
    generate_predictions_from_rows(
        database=database,
        settings=settings,
        price_rows=price_rows,
        fundamental_rows=fundamental_rows,
    )
    return 0


def generate_predictions_from_rows(
    *,
    database: SupabaseDatabase,
    settings: Settings,
    price_rows: list[dict[str, Any]],
    fundamental_rows: list[dict[str, Any]],
) -> PredictionResult:
    if not price_rows:
        LOGGER.warning("Prediction generation skipped because prices are missing.")
        return PredictionResult(prediction_rows=[])

    feature_rows = build_feature_rows(price_rows)
    if not feature_rows:
        LOGGER.warning("Prediction generation skipped because no features could be built.")
        return PredictionResult(prediction_rows=[])

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

    return PredictionResult(prediction_rows=prediction_rows)


def run_seed_model_predictions(
    *,
    target_start: str,
    target_end: str,
    tickers: tuple[str, ...] | None = None,
    model_slugs: tuple[str, ...] | None = None,
    dry_run: bool = False,
    include_latest: bool = False,
) -> int:
    start_date = parse_date(target_start)
    end_date = parse_date(target_end)
    if end_date < start_date:
        LOGGER.error("target-end must be on or after target-start.")
        return 1

    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Historical prediction seeding skipped because Supabase credentials are not configured."
        )
        return 0

    target_tickers = tickers or daily_prediction_tickers()
    feature_price_tickers = tuple(dict.fromkeys((*target_tickers, "SPY")))
    feature_start, price_start = seed_fetch_start_dates(start_date, settings)
    LOGGER.info(
        "Fetching seed prices from %s through %s for %s tickers.",
        price_start,
        target_end,
        len(feature_price_tickers),
    )
    price_rows = database.fetch_prices(
        start_date=price_start,
        end_date=target_end,
        tickers=feature_price_tickers,
    )
    if not price_rows:
        LOGGER.warning("Historical prediction seeding skipped because prices are missing.")
        return 0

    feature_rows = bounded_feature_rows_from_prices(
        price_rows,
        start_date=feature_start,
        end_date=target_end,
    )
    if not feature_rows:
        LOGGER.warning("Historical prediction seeding skipped because no features could be built.")
        return 0

    result = seed_predictions_for_target_window(
        feature_rows=feature_rows,
        price_rows=price_rows,
        settings=settings,
        target_start=start_date,
        target_end=end_date,
        tickers=target_tickers,
        model_slugs=model_slugs,
    )
    if dry_run:
        LOGGER.info(
            "Historical prediction seeding dry run produced %s prediction rows.",
            len(result.prediction_rows),
        )
    else:
        written = database.upsert_predictions(result.prediction_rows)
        LOGGER.info("Historical prediction seeding wrote %s predictions.", written)

    if result.prediction_rows:
        LOGGER.info(
            "Seeded target date range: %s -> %s.",
            min(str(row["target_date"]) for row in result.prediction_rows),
            max(str(row["target_date"]) for row in result.prediction_rows),
        )
        LOGGER.info(
            "Seeded prediction date range: %s -> %s.",
            min(str(row["prediction_date"]) for row in result.prediction_rows),
            max(str(row["prediction_date"]) for row in result.prediction_rows),
        )
    if result.skipped:
        LOGGER.warning("Historical prediction seeding skipped %s rows/pairs.", len(result.skipped))
        for message in result.skipped[:10]:
            LOGGER.warning(message)
        if len(result.skipped) > 10:
            LOGGER.warning("...and %s more skips.", len(result.skipped) - 10)

    if dry_run:
        return 0
    if include_latest:
        latest_status = run_predict_horizons()
        if latest_status != 0:
            return latest_status

    return 0


def seed_fetch_start_dates(start_date, settings) -> tuple[str, str]:
    feature_start = start_date - timedelta(days=1500)
    max_context_length = max(settings.timesfm_context_length, settings.chronos_context_length)
    price_start = start_date - timedelta(days=365 + max(2200, max_context_length * 2))
    return feature_start.isoformat(), price_start.isoformat()


def bounded_feature_rows_from_prices(
    price_rows: list[dict[str, Any]],
    *,
    start_date: str,
    end_date: str,
) -> list[dict[str, Any]]:
    lower_bound = parse_date(start_date)
    upper_bound = parse_date(end_date)
    return [
        row
        for row in build_feature_rows(price_rows)
        if lower_bound <= parse_date(str(row["date"])) <= upper_bound
    ]
