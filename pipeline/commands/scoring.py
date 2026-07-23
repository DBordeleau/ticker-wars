from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from pipeline.db import SupabaseDatabase
from pipeline.evaluation.metrics import calculate_model_metrics
from pipeline.evaluation.scoring import (
    score_matured_predictions,
    score_matured_user_predictions,
)

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScoringResult:
    prediction_scores: list[dict[str, Any]]
    user_prediction_scores: list[dict[str, Any]]


def run_score() -> int:
    database = SupabaseDatabase.from_settings()
    if database is None:
        LOGGER.info("Prediction scoring skipped because Supabase credentials are not configured.")
        return 0

    prediction_rows = database.fetch_predictions()
    user_prediction_rows = database.fetch_user_predictions(status="pending")
    price_rows = database.fetch_prices()
    score_predictions_from_rows(
        database=database,
        prediction_rows=prediction_rows,
        user_prediction_rows=user_prediction_rows,
        price_rows=price_rows,
    )
    return 0


def score_predictions_from_rows(
    *,
    database: SupabaseDatabase,
    prediction_rows: list[dict[str, Any]],
    user_prediction_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
) -> ScoringResult:
    if not price_rows:
        LOGGER.warning("Prediction scoring skipped because prices are missing.")
        return ScoringResult(prediction_scores=[], user_prediction_scores=[])

    score_rows = score_matured_predictions(prediction_rows, price_rows)
    written = database.upsert_prediction_scores(score_rows)
    metrics = calculate_model_metrics(score_rows)
    user_score_rows = score_matured_user_predictions(user_prediction_rows, price_rows)
    user_written = database.upsert_user_prediction_scores(user_score_rows)
    user_score_prediction_ids = [str(row["prediction_id"]) for row in user_score_rows]
    database.mark_user_predictions_scored(user_score_prediction_ids)
    user_rewards_granted = database.grant_scored_prediction_rewards(user_score_prediction_ids)

    LOGGER.info("Prediction scoring wrote %s scored predictions.", written)
    LOGGER.info("User prediction scoring wrote %s scored predictions.", user_written)
    LOGGER.info("User prediction rewards granted for %s scored predictions.", user_rewards_granted)
    latest_scored_target_date = max(
        (str(row["target_date"]) for row in score_rows + user_score_rows),
        default=None,
    )
    if latest_scored_target_date is not None:
        LOGGER.info("Latest scored target date: %s", latest_scored_target_date)
    LOGGER.info("Calculated %s model metric rows for this scoring batch.", len(metrics))
    return ScoringResult(
        prediction_scores=score_rows,
        user_prediction_scores=user_score_rows,
    )
