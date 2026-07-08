from __future__ import annotations

from datetime import date
from typing import Any

from pipeline.forecasting.horizons import HorizonTarget
from pipeline.models.base import PredictionInterval, build_prediction_row

BASELINE_MODEL_NAME = "Baseline"
BASELINE_MODEL_SLUG = "baseline"


def predict_zero_return() -> float:
    return 0.0


def build_baseline_prediction_row(
    *,
    ticker: str,
    prediction_date: date,
    target: HorizonTarget,
    reference_close: float,
    interval: PredictionInterval | None = None,
    model_metadata: dict[str, Any] | None = None,
    created_at: str | None = None,
) -> dict[str, Any]:
    """Synthesize the deterministic baseline row while it still uses stored predictions."""

    return build_prediction_row(
        ticker=ticker,
        prediction_date=prediction_date,
        target=target,
        model_name=BASELINE_MODEL_NAME,
        model_slug=BASELINE_MODEL_SLUG,
        reference_close=reference_close,
        predicted_return=predict_zero_return(),
        interval=interval,
        model_metadata={
            "baseline_prediction_source": "deterministic-synthesis",
            **(model_metadata or {}),
        },
        created_at=created_at,
    )


class BaselineReturnModel:
    def fit(self, feature_rows: object, targets: object) -> BaselineReturnModel:
        return self

    def predict(self, feature_rows: object) -> list[float]:
        try:
            row_count = len(feature_rows)  # type: ignore[arg-type]
        except TypeError:
            row_count = 1
        return [predict_zero_return()] * row_count
