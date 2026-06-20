from __future__ import annotations

import math
from collections import defaultdict
from datetime import date
from typing import Any

METRIC_WINDOWS: tuple[str, ...] = ("7d", "30d", "90d", "all")


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
        model_groups = _group_by_model(window_rows)
        window_metrics = [
            _calculate_single_model_metrics(model_name, window, rows)
            for model_name, rows in model_groups.items()
            if rows
        ]
        metrics.extend(_rank_window_metrics(window_metrics))

    return metrics


def _filter_score_rows(score_rows: list[dict[str, Any]], window: str) -> list[dict[str, Any]]:
    if window == "all":
        return score_rows

    window_size = int(window.removesuffix("d"))
    dates = sorted({_parse_date(row["target_date"]) for row in score_rows})
    included_dates = set(dates[-window_size:])
    return [row for row in score_rows if _parse_date(row["target_date"]) in included_dates]


def _group_by_model(score_rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in score_rows:
        grouped[row["model_name"]].append(row)
    return dict(grouped)


def _calculate_single_model_metrics(
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
        "model_name": model_name,
        "mae": sum(absolute_errors) / len(absolute_errors),
        "rmse": math.sqrt(sum(squared_errors) / len(squared_errors)),
        "mape": sum(absolute_pct_errors) / len(absolute_pct_errors),
        "directional_accuracy": sum(direction_correct) / len(direction_correct),
        "prediction_count": len(rows),
    }


def _rank_window_metrics(metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        metrics,
        key=lambda row: (
            row["mae"],
            -row["directional_accuracy"],
            -row["prediction_count"],
            row["model_name"],
        ),
    )
    for rank, row in enumerate(ranked, start=1):
        row["rank"] = rank
    return ranked


def _parse_date(value: object) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))
