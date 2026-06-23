from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pandas as pd

from pipeline.evaluation.metrics import absolute_percentage_error, direction

DEFAULT_INTERVAL_LEVEL = 0.80
WINKLER_ALPHA = 1 - DEFAULT_INTERVAL_LEVEL


def score_matured_predictions(
    prediction_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    actual_closes = _actual_close_by_ticker_date(price_rows)
    scored_at = datetime.now(UTC).isoformat()
    score_rows: list[dict[str, Any]] = []

    for prediction in prediction_rows:
        key = (str(prediction["ticker"]), str(prediction["target_date"]))
        actual_close = actual_closes.get(key)
        if actual_close is None:
            continue

        reference_close = float(prediction["reference_close"])
        predicted_close = float(prediction["predicted_close"])
        predicted_return = float(prediction["predicted_return"])
        actual_return = actual_close / reference_close - 1
        absolute_error = abs(predicted_close - actual_close)

        score_rows.append(
            {
                "prediction_id": prediction["prediction_id"],
                "prediction_date": prediction["prediction_date"],
                "target_date": prediction["target_date"],
                "prediction_horizon": prediction["prediction_horizon"],
                "ticker": prediction["ticker"],
                "model_name": prediction["model_name"],
                "model_slug": prediction["model_slug"],
                "actual_close": actual_close,
                "actual_return": actual_return,
                "absolute_error": absolute_error,
                "squared_error": absolute_error**2,
                "absolute_pct_error": absolute_percentage_error(actual_close, predicted_close),
                "predicted_direction": direction(predicted_return),
                "actual_direction": direction(actual_return),
                "direction_correct": int(direction(predicted_return) == direction(actual_return)),
                **_interval_score_fields(prediction, actual_close, reference_close),
                "scored_at": scored_at,
            }
        )

    return score_rows


def score_matured_user_predictions(
    prediction_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    actual_closes = _actual_close_by_ticker_date(price_rows)
    scored_at = datetime.now(UTC).isoformat()
    score_rows: list[dict[str, Any]] = []

    for prediction in prediction_rows:
        key = (str(prediction["ticker"]), str(prediction["target_date"]))
        actual_close = actual_closes.get(key)
        if actual_close is None:
            continue

        reference_close = float(prediction["reference_close"])
        predicted_close = float(prediction["predicted_close"])
        predicted_return = float(prediction["predicted_return"])
        actual_return = actual_close / reference_close - 1
        absolute_error = abs(predicted_close - actual_close)

        score_rows.append(
            {
                "prediction_id": prediction["prediction_id"],
                "user_id": prediction["user_id"],
                "prediction_date": prediction["prediction_date"],
                "target_date": prediction["target_date"],
                "prediction_horizon": prediction["prediction_horizon"],
                "ticker": prediction["ticker"],
                "actual_close": actual_close,
                "actual_return": actual_return,
                "absolute_error": absolute_error,
                "squared_error": absolute_error**2,
                "absolute_pct_error": absolute_percentage_error(actual_close, predicted_close),
                "predicted_direction": direction(predicted_return),
                "actual_direction": direction(actual_return),
                "direction_correct": int(direction(predicted_return) == direction(actual_return)),
                "scored_at": scored_at,
            }
        )

    return score_rows


def _actual_close_by_ticker_date(price_rows: list[dict[str, Any]]) -> dict[tuple[str, str], float]:
    if not price_rows:
        return {}

    prices = pd.DataFrame(price_rows)
    prices["date"] = pd.to_datetime(prices["date"]).dt.date.astype(str)
    prices["close"] = pd.to_numeric(prices["close"], errors="coerce")
    prices = prices.dropna(subset=["ticker", "date", "close"])
    return {
        (str(row["ticker"]), str(row["date"])): float(row["close"])
        for row in prices.to_dict("records")
    }


def _interval_score_fields(
    prediction: dict[str, Any],
    actual_close: float,
    reference_close: float,
) -> dict[str, float | bool | None]:
    lower = prediction.get("predicted_close_lower")
    upper = prediction.get("predicted_close_upper")
    if lower is None or upper is None:
        return {
            "interval_hit": None,
            "interval_width": None,
            "interval_width_pct": None,
            "interval_miss_distance": None,
            "winkler_score": None,
        }

    lower_close = float(lower)
    upper_close = float(upper)
    if lower_close > upper_close:
        lower_close, upper_close = upper_close, lower_close

    width = upper_close - lower_close
    miss_distance = _interval_miss_distance(actual_close, lower_close, upper_close)

    if actual_close < lower_close:
        winkler_score = width + (2 / WINKLER_ALPHA) * (lower_close - actual_close)
    elif actual_close > upper_close:
        winkler_score = width + (2 / WINKLER_ALPHA) * (actual_close - upper_close)
    else:
        winkler_score = width

    return {
        "interval_hit": miss_distance == 0,
        "interval_width": width,
        "interval_width_pct": width / reference_close if reference_close else None,
        "interval_miss_distance": miss_distance,
        "winkler_score": winkler_score,
    }


def _interval_miss_distance(
    actual_close: float,
    lower_close: float,
    upper_close: float,
) -> float:
    if actual_close < lower_close:
        return lower_close - actual_close
    if actual_close > upper_close:
        return actual_close - upper_close
    return 0.0
