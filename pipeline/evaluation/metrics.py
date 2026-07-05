from __future__ import annotations

import math
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from pipeline.forecasting.horizons import FORECAST_HORIZONS

METRIC_WINDOWS: tuple[str, ...] = ("7d", "30d", "90d", "all")
METRIC_HORIZONS: tuple[str, ...] = (*FORECAST_HORIZONS, "all")


def direction(value: float) -> int:
    if value > 0:
        return 1
    if value < 0:
        return -1
    return 0


def absolute_percentage_error(actual: float, predicted: float) -> float:
    if actual == 0:
        raise ValueError("Cannot calculate percent error when actual value is zero.")
    return abs(predicted - actual) / abs(actual)


def calculate_model_metrics(score_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []

    for window in METRIC_WINDOWS:
        window_rows = _filter_score_rows(score_rows, window)
        model_groups = _group_by_horizon_and_model(window_rows)
        window_metrics = [
            _calculate_single_model_metrics(horizon, model_name, window, rows)
            for (horizon, model_name), rows in model_groups.items()
            if rows
        ]
        metrics.extend(_rank_window_metrics(window_metrics))

    return metrics


def calculate_user_metrics(score_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    metrics: list[dict[str, Any]] = []

    for window in METRIC_WINDOWS:
        window_rows = _filter_score_rows(score_rows, window)
        user_groups = _group_by_horizon_and_user(window_rows)
        window_metrics = [
            _calculate_single_user_metrics(horizon, user_id, window, rows)
            for (horizon, user_id), rows in user_groups.items()
            if rows
        ]
        metrics.extend(_rank_user_window_metrics(window_metrics))

    return metrics


def _filter_score_rows(score_rows: list[dict[str, Any]], window: str) -> list[dict[str, Any]]:
    if not score_rows:
        return []

    if window == "all":
        return score_rows

    window_size = int(window.removesuffix("d"))
    latest_scored_at = max(_parse_scored_at(row) for row in score_rows)
    cutoff = latest_scored_at - timedelta(days=window_size - 1)
    return [row for row in score_rows if _parse_scored_at(row) >= cutoff]


def _group_by_horizon_and_model(
    score_rows: list[dict[str, Any]],
) -> dict[tuple[str, str], list[dict[str, Any]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in score_rows:
        model_name = row["model_name"]
        grouped[(row.get("prediction_horizon", "1w"), model_name)].append(row)
        grouped[("all", model_name)].append(row)
    return dict(grouped)


def _group_by_horizon_and_user(
    score_rows: list[dict[str, Any]],
) -> dict[tuple[str, str], list[dict[str, Any]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in score_rows:
        user_id = str(row["user_id"])
        grouped[(row.get("prediction_horizon", "1w"), user_id)].append(row)
        grouped[("all", user_id)].append(row)
    return dict(grouped)


def _calculate_single_model_metrics(
    horizon: str,
    model_name: str,
    window: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    absolute_errors = [float(row["absolute_error"]) for row in rows]
    squared_errors = [float(row["squared_error"]) for row in rows]
    absolute_pct_errors = [float(row["absolute_pct_error"]) for row in rows]
    direction_correct = [int(row["direction_correct"]) for row in rows]

    return {
        "window": window,
        "prediction_horizon": horizon,
        "model_name": model_name,
        "mae": sum(absolute_errors) / len(absolute_errors),
        "rmse": math.sqrt(sum(squared_errors) / len(squared_errors)),
        "mape": sum(absolute_pct_errors) / len(absolute_pct_errors),
        "directional_accuracy": sum(direction_correct) / len(direction_correct),
        "winkler_score": _average_optional_float(row.get("winkler_score") for row in rows),
        "prediction_count": len(rows),
    }


def _calculate_single_user_metrics(
    horizon: str,
    user_id: str,
    window: str,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    absolute_errors = [float(row["absolute_error"]) for row in rows]
    squared_errors = [float(row["squared_error"]) for row in rows]
    absolute_pct_errors = [float(row["absolute_pct_error"]) for row in rows]
    direction_correct = [int(row["direction_correct"]) for row in rows]
    first_row = rows[0]

    return {
        "window": window,
        "prediction_horizon": horizon,
        "user_id": user_id,
        "username": first_row.get("username", user_id),
        "mae": sum(absolute_errors) / len(absolute_errors),
        "rmse": math.sqrt(sum(squared_errors) / len(squared_errors)),
        "mape": sum(absolute_pct_errors) / len(absolute_pct_errors),
        "directional_accuracy": sum(direction_correct) / len(direction_correct),
        "winkler_score": None,
        "prediction_count": len(rows),
    }


def _rank_window_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_horizon: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in metrics:
        by_horizon[row["prediction_horizon"]].append(row)

    ranked_metrics: list[dict[str, Any]] = []
    for horizon_metrics in by_horizon.values():
        ranked_metrics.extend(_rank_horizon_metrics(horizon_metrics))
    return ranked_metrics


def _rank_user_window_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_horizon: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in metrics:
        by_horizon[row["prediction_horizon"]].append(row)

    ranked_metrics: list[dict[str, Any]] = []
    for horizon_metrics in by_horizon.values():
        ranked_metrics.extend(_rank_user_horizon_metrics(horizon_metrics))
    return ranked_metrics


def _rank_horizon_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        metrics,
        key=lambda row: (
            row["mape"],
            row["mae"],
            row["winkler_score"] if row["winkler_score"] is not None else math.inf,
            -row["directional_accuracy"],
            -row["prediction_count"],
            row["model_name"],
        ),
    )
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank
    return ranked


def _rank_user_horizon_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        metrics,
        key=lambda row: (
            row["mape"],
            row["mae"],
            -row["directional_accuracy"],
            -row["prediction_count"],
            str(row["username"]).lower(),
            str(row["user_id"]),
        ),
    )
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank
    return ranked


def _average_optional_float(values: Any) -> float | None:
    numbers = [float(value) for value in values if value is not None]
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


def _parse_scored_at(row: dict[str, Any]) -> datetime:
    value = row.get("scored_at") or row["target_date"]
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)
