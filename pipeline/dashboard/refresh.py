from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pipeline.config import Settings
from pipeline.evaluation.metrics import METRIC_WINDOWS, calculate_model_metrics
from pipeline.models.registry import MODEL_SLUGS


@dataclass(frozen=True)
class DashboardRefreshResult:
    latest_predictions: int
    model_leaderboard: int
    ticker_history: int
    run_metadata: int


def build_dashboard_tables(
    prediction_rows: list[dict[str, Any]],
    score_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
    settings: Settings,
) -> dict[str, list[dict[str, Any]]]:
    generated_at = datetime.now(UTC).isoformat()
    scored_predictions = _merge_predictions_and_scores(prediction_rows, score_rows)

    return {
        "dashboard_latest_predictions": _build_latest_predictions(
            prediction_rows,
            generated_at,
        ),
        "dashboard_model_leaderboard": _build_model_leaderboard(
            scored_predictions,
            generated_at,
        ),
        "dashboard_ticker_history": _build_ticker_history(
            scored_predictions,
            generated_at,
        ),
        "dashboard_run_metadata": [
            _build_run_metadata(
                prediction_rows=prediction_rows,
                score_rows=score_rows,
                price_rows=price_rows,
                generated_at=generated_at,
                settings=settings,
            )
        ],
    }


def _build_latest_predictions(
    prediction_rows: list[dict[str, Any]],
    generated_at: str,
) -> list[dict[str, Any]]:
    if not prediction_rows:
        return []

    latest_prediction_date = max(str(row["prediction_date"]) for row in prediction_rows)
    latest_rows = [
        row
        for row in prediction_rows
        if str(row["prediction_date"]) == latest_prediction_date
    ]

    return [
        {
            "generated_at": generated_at,
            "prediction_id": row["prediction_id"],
            "prediction_date": row["prediction_date"],
            "target_date": row["target_date"],
            "prediction_horizon": row["prediction_horizon"],
            "ticker": row["ticker"],
            "model_name": row["model_name"],
            "model_slug": row.get("model_slug") or _model_slug(row["model_name"]),
            "reference_close": row["reference_close"],
            "predicted_return": row["predicted_return"],
            "predicted_close": row["predicted_close"],
            "predicted_close_lower": row.get("predicted_close_lower"),
            "predicted_close_upper": row.get("predicted_close_upper"),
            "interval_level": row.get("interval_level"),
            "reasoning_summary": row.get("reasoning_summary"),
            "model_metadata": row.get("model_metadata"),
        }
        for row in sorted(latest_rows, key=lambda item: (item["ticker"], item["model_name"]))
    ]


def _build_model_leaderboard(
    scored_predictions: list[dict[str, Any]],
    generated_at: str,
) -> list[dict[str, Any]]:
    matured_predictions = [
        row for row in scored_predictions if row.get("absolute_error") is not None
    ]
    metric_rows = calculate_model_metrics(matured_predictions)
    by_window_horizon_and_model = {
        (row["window"], row["prediction_horizon"], row["model_name"]): row
        for row in metric_rows
    }
    model_names = _known_model_names(scored_predictions)
    horizons = _known_horizons(scored_predictions)
    rows: list[dict[str, Any]] = []

    for window in METRIC_WINDOWS:
        for horizon in horizons:
            for model_name in model_names:
                metric = by_window_horizon_and_model.get((window, horizon, model_name), {})
                rows.append(
                    {
                        "generated_at": generated_at,
                        "evaluation_window": window,
                        "prediction_horizon": horizon,
                        "model_name": model_name,
                        "model_slug": _model_slug(model_name),
                        "mae": metric.get("mae"),
                        "directional_accuracy": metric.get("directional_accuracy"),
                        "winkler_score": metric.get("winkler_score"),
                        "scored_count": metric.get("prediction_count", 0),
                        "rank": metric.get("rank"),
                        "is_toy_model": model_name == "Warren Buffbot",
                    }
                )

    return rows


def _build_ticker_history(
    scored_predictions: list[dict[str, Any]],
    generated_at: str,
) -> list[dict[str, Any]]:
    return [
        {
            "generated_at": generated_at,
            "ticker": row["ticker"],
            "prediction_date": row["prediction_date"],
            "target_date": row["target_date"],
            "prediction_horizon": row["prediction_horizon"],
            "actual_close": row.get("actual_close"),
            "model_name": row["model_name"],
            "model_slug": row.get("model_slug") or _model_slug(row["model_name"]),
            "predicted_close": row["predicted_close"],
            "predicted_close_lower": row.get("predicted_close_lower"),
            "predicted_close_upper": row.get("predicted_close_upper"),
            "predicted_return": row["predicted_return"],
            "actual_return": row.get("actual_return"),
            "winkler_score": row.get("winkler_score"),
            "reasoning_summary": row.get("reasoning_summary"),
        }
        for row in sorted(
            scored_predictions,
            key=lambda item: (item["ticker"], item["target_date"], item["model_name"]),
        )
    ]


def _build_run_metadata(
    prediction_rows: list[dict[str, Any]],
    score_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
    generated_at: str,
    settings: Settings,
) -> dict[str, Any]:
    prediction_tickers = {row["ticker"] for row in prediction_rows}
    price_tickers = {row["ticker"] for row in price_rows}
    return {
        "generated_at": generated_at,
        "latest_price_date": max((str(row["date"]) for row in price_rows), default=None),
        "latest_prediction_date": max(
            (str(row["prediction_date"]) for row in prediction_rows),
            default=None,
        ),
        "ticker_count": len(prediction_tickers or price_tickers),
        "model_count": len({row["model_name"] for row in prediction_rows}),
        "prediction_count": len(prediction_rows),
        "scored_count": len(score_rows),
        "data_source": settings.market_data_source,
        "last_pipeline_status": "success",
    }


def _known_horizons(scored_predictions: list[dict[str, Any]]) -> list[str]:
    observed = sorted({row.get("prediction_horizon") for row in scored_predictions})
    return [horizon for horizon in ("1w", "1m", "3m", "1y") if horizon in observed] or [
        "1w",
        "1m",
        "3m",
        "1y",
    ]


def _merge_predictions_and_scores(
    prediction_rows: list[dict[str, Any]],
    score_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    scores_by_prediction_id = {
        row["prediction_id"]: row for row in score_rows
    }
    merged_rows: list[dict[str, Any]] = []

    for prediction in prediction_rows:
        merged = dict(prediction)
        score = scores_by_prediction_id.get(prediction["prediction_id"])
        if score:
            merged.update(score)
        merged_rows.append(merged)

    return merged_rows


def _known_model_names(scored_predictions: list[dict[str, Any]]) -> list[str]:
    known_names = list(MODEL_SLUGS)
    observed_names = sorted({row["model_name"] for row in scored_predictions})
    return known_names + [name for name in observed_names if name not in MODEL_SLUGS]


def _model_slug(model_name: str) -> str:
    return MODEL_SLUGS.get(model_name, model_name.lower().replace(" ", "-"))
