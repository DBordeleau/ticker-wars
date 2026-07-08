from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Protocol

import pandas as pd

from pipeline.forecasting.horizons import FORECAST_HORIZONS, ForecastHorizon, HorizonTarget

DEFAULT_INTERVAL_LEVEL = 0.80
MIN_INTERVAL_OBSERVATIONS = 2
PREDICTION_ID_HEX_LENGTH = 32


@dataclass(frozen=True)
class PredictionInterval:
    predicted_return_lower: float
    predicted_return_upper: float
    interval_level: float = DEFAULT_INTERVAL_LEVEL
    interval_method: str = "pipeline-calibrated"


@dataclass(frozen=True)
class PredictionContext:
    ticker: str
    prediction_date: date
    reference_close: float
    latest_features: dict[str, float]
    history: Any


class PredictionModelAdapter(Protocol):
    name: str
    slug: str
    supports_intervals: bool
    supported_horizons: tuple[ForecastHorizon, ...]

    def predict(self, context: PredictionContext) -> list[dict[str, Any]]:
        ...


def build_prediction_row(
    *,
    ticker: str,
    prediction_date: date,
    target: HorizonTarget,
    model_name: str,
    model_slug: str,
    reference_close: float,
    predicted_return: float,
    interval: PredictionInterval | None = None,
    reasoning_summary: str | None = None,
    model_metadata: dict[str, Any] | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    _validate_horizon(target.horizon)
    _validate_number("reference_close", reference_close)
    _validate_number("predicted_return", predicted_return)

    predicted_close = reference_close * (1 + predicted_return)
    row = {
        "prediction_id": _prediction_id(
            ticker=ticker,
            prediction_date=prediction_date,
            target_date=target.target_date,
            horizon=target.horizon,
            model_slug=model_slug,
        ),
        "ticker": ticker,
        "prediction_date": prediction_date.isoformat(),
        "target_date": target.target_date.isoformat(),
        "prediction_horizon": target.horizon,
        "horizon_calendar_days": target.horizon_calendar_days,
        "horizon_trading_days": target.horizon_trading_days,
        "model_name": model_name,
        "model_slug": model_slug,
        "predicted_return": predicted_return,
        "predicted_close": predicted_close,
        "reference_close": reference_close,
        "reasoning_summary": reasoning_summary,
        "model_metadata": {"model_slug": model_slug, **(model_metadata or {})},
        "created_at": created_at or datetime.now(UTC).isoformat(),
    }

    if interval is not None:
        row.update(_interval_fields(interval, reference_close))

    return row


def residual_prediction_interval(
    *,
    actual_returns: Sequence[float],
    fitted_returns: Sequence[float],
    point_prediction: float,
    interval_level: float = DEFAULT_INTERVAL_LEVEL,
) -> PredictionInterval | None:
    if len(actual_returns) != len(fitted_returns):
        raise ValueError("actual_returns and fitted_returns must have the same length.")
    if len(actual_returns) < MIN_INTERVAL_OBSERVATIONS:
        return None

    residuals = [
        actual - fitted
        for actual, fitted in zip(actual_returns, fitted_returns, strict=True)
        if pd.notna(actual) and pd.notna(fitted)
    ]
    if len(residuals) < MIN_INTERVAL_OBSERVATIONS:
        return None

    alpha = 1 - interval_level
    lower_residual = float(pd.Series(residuals).quantile(alpha / 2))
    upper_residual = float(pd.Series(residuals).quantile(1 - alpha / 2))
    return PredictionInterval(
        predicted_return_lower=point_prediction + lower_residual,
        predicted_return_upper=point_prediction + upper_residual,
        interval_level=interval_level,
        interval_method="residual-calibrated",
    )


def historical_return_interval(
    *,
    target_returns: Sequence[float],
    interval_level: float = DEFAULT_INTERVAL_LEVEL,
) -> PredictionInterval | None:
    clean_returns = [float(value) for value in target_returns if pd.notna(value)]
    if len(clean_returns) < MIN_INTERVAL_OBSERVATIONS:
        return None

    alpha = 1 - interval_level
    series = pd.Series(clean_returns)
    return PredictionInterval(
        predicted_return_lower=float(series.quantile(alpha / 2)),
        predicted_return_upper=float(series.quantile(1 - alpha / 2)),
        interval_level=interval_level,
        interval_method="historical-horizon-return",
    )


def _prediction_id(
    *,
    ticker: str,
    prediction_date: date,
    target_date: date,
    horizon: ForecastHorizon,
    model_slug: str,
) -> str:
    return compact_prediction_id(
        ticker=ticker,
        prediction_date=prediction_date,
        target_date=target_date,
        horizon=horizon,
        model_slug=model_slug,
    )


def compact_prediction_id(
    *,
    ticker: str,
    prediction_date: date | str,
    target_date: date | str,
    horizon: ForecastHorizon | str,
    model_slug: str,
) -> str:
    """Return a deterministic compact ID for a model prediction natural identity."""

    identity = "|".join(
        (
            str(ticker),
            _date_identity_part(prediction_date),
            _date_identity_part(target_date),
            str(horizon),
            str(model_slug),
        )
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()[:PREDICTION_ID_HEX_LENGTH]


def _date_identity_part(value: date | str) -> str:
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


def _interval_fields(
    interval: PredictionInterval,
    reference_close: float,
) -> dict[str, float | str]:
    _validate_interval(interval)
    return {
        "predicted_return_lower": interval.predicted_return_lower,
        "predicted_return_upper": interval.predicted_return_upper,
        "predicted_close_lower": reference_close * (1 + interval.predicted_return_lower),
        "predicted_close_upper": reference_close * (1 + interval.predicted_return_upper),
        "interval_level": interval.interval_level,
        "interval_method": interval.interval_method,
    }


def _validate_horizon(horizon: str) -> None:
    if horizon not in FORECAST_HORIZONS:
        raise ValueError(f"Unsupported prediction horizon: {horizon!r}")


def _validate_interval(interval: PredictionInterval) -> None:
    if not 0 < interval.interval_level < 1:
        raise ValueError("interval_level must be between 0 and 1.")
    _validate_number("predicted_return_lower", interval.predicted_return_lower)
    _validate_number("predicted_return_upper", interval.predicted_return_upper)
    if interval.predicted_return_lower > interval.predicted_return_upper:
        raise ValueError("Prediction interval lower bound cannot exceed upper bound.")


def _validate_number(name: str, value: float) -> None:
    number = float(value)
    if pd.isna(number) or number in (float("inf"), float("-inf")):
        raise ValueError(f"{name} must be finite.")
