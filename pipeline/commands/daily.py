from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from pipeline.commands.dashboard import export_dashboard_tables, refresh_dashboard_tables
from pipeline.commands.predictions import generate_predictions_from_rows
from pipeline.commands.scoring import score_predictions_from_rows
from pipeline.config import Settings, load_settings
from pipeline.dashboard.refresh import build_dashboard_tables
from pipeline.db import SupabaseDatabase

LOGGER = logging.getLogger(__name__)


@dataclass
class DailyPipelineContext:
    prices: list[dict[str, Any]]
    predictions: list[dict[str, Any]]
    prediction_scores: list[dict[str, Any]]
    user_predictions: list[dict[str, Any]]
    user_prediction_scores: list[dict[str, Any]]
    user_profiles: list[dict[str, Any]]
    fundamentals: list[dict[str, Any]]


def run_shared_daily_pipeline() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Shared daily pipeline skipped because Supabase credentials are not configured."
        )
        return 0

    context = load_daily_pipeline_context(database)
    scoring_result = score_predictions_from_rows(
        database=database,
        prediction_rows=context.predictions,
        user_prediction_rows=[
            dict(row) for row in context.user_predictions if row.get("status") == "pending"
        ],
        price_rows=context.prices,
    )
    context.prediction_scores = merge_rows_by_id(
        context.prediction_scores,
        scoring_result.prediction_scores,
    )
    context.user_prediction_scores = merge_rows_by_id(
        context.user_prediction_scores,
        scoring_result.user_prediction_scores,
    )
    mark_context_user_predictions_scored(
        context.user_predictions,
        scoring_result.user_prediction_scores,
    )

    prediction_result = generate_predictions_from_rows(
        database=database,
        settings=settings,
        price_rows=context.prices,
        fundamental_rows=context.fundamentals,
    )
    context.predictions = merge_rows_by_id(
        context.predictions,
        prediction_result.prediction_rows,
    )

    publish_dashboard_from_context(database, settings, context)
    return 0


def load_daily_pipeline_context(database: SupabaseDatabase) -> DailyPipelineContext:
    context = DailyPipelineContext(
        prices=database.fetch_prices(),
        predictions=database.fetch_predictions(),
        prediction_scores=database.fetch_prediction_scores(),
        user_predictions=database.fetch_user_predictions(),
        user_prediction_scores=database.fetch_user_prediction_scores(),
        user_profiles=database.fetch_user_profiles(),
        fundamentals=database.fetch_latest_fundamentals(),
    )
    LOGGER.info(
        "Loaded shared daily pipeline context prices=%s predictions=%s "
        "prediction_scores=%s user_predictions=%s user_prediction_scores=%s "
        "user_profiles=%s fundamentals=%s",
        len(context.prices),
        len(context.predictions),
        len(context.prediction_scores),
        len(context.user_predictions),
        len(context.user_prediction_scores),
        len(context.user_profiles),
        len(context.fundamentals),
    )
    return context


def publish_dashboard_from_context(
    database: SupabaseDatabase,
    settings: Settings,
    context: DailyPipelineContext,
) -> None:
    dashboard_tables = build_dashboard_tables(
        prediction_rows=context.predictions,
        score_rows=context.prediction_scores,
        price_rows=context.prices,
        user_prediction_rows=context.user_predictions,
        user_score_rows=context.user_prediction_scores,
        user_profile_rows=context.user_profiles,
        settings=settings,
    )
    refresh_dashboard_tables(database, dashboard_tables)
    export_dashboard_tables(dashboard_tables, settings.export_dir)


def merge_rows_by_id(
    existing_rows: list[dict[str, Any]],
    updated_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged = list(existing_rows)
    positions = {
        str(row["prediction_id"]): index
        for index, row in enumerate(merged)
        if row.get("prediction_id") is not None
    }
    for row in updated_rows:
        prediction_id = row.get("prediction_id")
        if prediction_id is None:
            merged.append(row)
            continue
        key = str(prediction_id)
        if key in positions:
            merged[positions[key]] = row
        else:
            positions[key] = len(merged)
            merged.append(row)
    return merged


def mark_context_user_predictions_scored(
    user_predictions: list[dict[str, Any]],
    user_score_rows: list[dict[str, Any]],
) -> None:
    scored_ids = {
        str(row["prediction_id"]) for row in user_score_rows if row.get("prediction_id") is not None
    }
    for row in user_predictions:
        if str(row.get("prediction_id")) in scored_ids:
            row["status"] = "scored"
