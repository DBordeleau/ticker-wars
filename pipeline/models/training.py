from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from pipeline.dates import next_trading_day
from pipeline.features.build_features import FEATURE_COLUMNS
from pipeline.models.registry import MODEL_SPECS, ModelSpec

MIN_TRAINING_ROWS = 100

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class TrainingResult:
    prediction_rows: list[dict[str, Any]]
    skipped: list[str]


def train_and_predict(
    feature_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
) -> TrainingResult:
    features = _feature_rows_to_frame(feature_rows)
    latest_prices = _latest_close_by_ticker(price_rows)
    predictions: list[dict[str, Any]] = []
    skipped: list[str] = []

    if features.empty:
        return TrainingResult(prediction_rows=[], skipped=["No feature rows available."])

    for ticker, ticker_features in features.groupby("ticker", sort=True):
        ticker_features = ticker_features.sort_values("date")
        latest_row = ticker_features.iloc[-1]
        prediction_date = pd.Timestamp(latest_row["date"]).date()
        target_date = next_trading_day(prediction_date)

        reference_close = latest_prices.get(ticker)
        if reference_close is None:
            skipped.append(f"{ticker}: no reference close found.")
            continue

        for spec in MODEL_SPECS:
            prediction = _predict_for_ticker(
                spec=spec,
                ticker_features=ticker_features,
                latest_row=latest_row,
                ticker=ticker,
                prediction_date=prediction_date,
                target_date=target_date,
                reference_close=reference_close,
            )
            if prediction is None:
                skipped.append(
                    f"{ticker}: skipped {spec.name}; fewer than "
                    f"{spec.minimum_training_rows} completed rows."
                )
                continue

            predictions.append(prediction)

    return TrainingResult(prediction_rows=predictions, skipped=skipped)


def _predict_for_ticker(
    spec: ModelSpec,
    ticker_features: pd.DataFrame,
    latest_row: pd.Series,
    ticker: str,
    prediction_date: object,
    target_date: object,
    reference_close: float,
) -> dict[str, Any] | None:
    completed_rows = ticker_features.dropna(subset=["target_next_return"])
    if len(completed_rows) < spec.minimum_training_rows:
        return None

    model = spec.make_model()
    if spec.minimum_training_rows > 0:
        model.fit(completed_rows[list(FEATURE_COLUMNS)], completed_rows["target_next_return"])

    prediction_features = pd.DataFrame([latest_row[list(FEATURE_COLUMNS)].to_dict()])
    predicted_return = float(model.predict(prediction_features)[0])
    predicted_close = reference_close * (1 + predicted_return)
    created_at = datetime.now(UTC).isoformat()
    prediction_date_text = prediction_date.isoformat()
    target_date_text = target_date.isoformat()

    return {
        "prediction_id": f"{ticker}:{target_date_text}:{spec.slug}",
        "ticker": ticker,
        "prediction_date": prediction_date_text,
        "target_date": target_date_text,
        "model_name": spec.name,
        "predicted_return": predicted_return,
        "predicted_close": predicted_close,
        "reference_close": reference_close,
        "reasoning_summary": None,
        "model_metadata": {"model_slug": spec.slug},
        "created_at": created_at,
    }


def _feature_rows_to_frame(feature_rows: list[dict[str, Any]]) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    for row in feature_rows:
        feature_json = row.get("feature_json") or {}
        record = {
            "ticker": row["ticker"],
            "date": pd.to_datetime(row["date"]),
            "target_next_return": row.get("target_next_return"),
        }
        record.update({name: float(feature_json[name]) for name in FEATURE_COLUMNS})
        records.append(record)

    return pd.DataFrame(records)


def _latest_close_by_ticker(price_rows: list[dict[str, Any]]) -> dict[str, float]:
    if not price_rows:
        return {}

    prices = pd.DataFrame(price_rows)
    prices["date"] = pd.to_datetime(prices["date"])
    prices["close"] = pd.to_numeric(prices["close"], errors="coerce")
    prices = prices.dropna(subset=["ticker", "date", "close"])
    latest = prices.sort_values("date").groupby("ticker", sort=True).tail(1)
    return {row["ticker"]: float(row["close"]) for row in latest.to_dict("records")}
