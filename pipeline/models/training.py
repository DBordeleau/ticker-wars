from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Any

import pandas as pd

from pipeline.features.build_features import (
    FEATURE_COLUMNS,
    TARGET_DATE_COLUMNS,
    TARGET_RETURN_COLUMNS,
)
from pipeline.forecasting.horizons import (
    FORECAST_HORIZONS,
    ForecastHorizon,
    HorizonTarget,
    add_horizon_offset,
    count_trading_days,
    resolve_horizon_target,
)
from pipeline.models.base import (
    build_prediction_row,
    historical_return_interval,
    residual_prediction_interval,
)
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

        reference_close = latest_prices.get(ticker)
        if reference_close is None:
            skipped.append(f"{ticker}: no reference close found.")
            continue

        for spec in MODEL_SPECS:
            for horizon in FORECAST_HORIZONS:
                prediction = _predict_for_ticker_horizon(
                    spec=spec,
                    ticker_features=ticker_features,
                    latest_row=latest_row,
                    ticker=ticker,
                    prediction_date=prediction_date,
                    horizon=horizon,
                    reference_close=reference_close,
                )
                if prediction is None:
                    skipped.append(
                        f"{ticker}: skipped {spec.name} {horizon.upper()}; fewer than "
                        f"{spec.minimum_training_rows} completed rows."
                    )
                    continue

                predictions.append(prediction)

    return TrainingResult(prediction_rows=predictions, skipped=skipped)


def _predict_for_ticker_horizon(
    spec: ModelSpec,
    ticker_features: pd.DataFrame,
    latest_row: pd.Series,
    ticker: str,
    prediction_date: date,
    horizon: ForecastHorizon,
    reference_close: float,
) -> dict[str, Any] | None:
    target_column = TARGET_RETURN_COLUMNS[horizon]
    completed_rows = ticker_features.dropna(subset=[target_column])
    if len(completed_rows) < spec.minimum_training_rows:
        return None

    model = spec.make_model()
    if spec.minimum_training_rows > 0:
        model.fit(completed_rows[list(FEATURE_COLUMNS)], completed_rows[target_column])

    prediction_features = pd.DataFrame([latest_row[list(FEATURE_COLUMNS)].to_dict()])
    predicted_return = float(model.predict(prediction_features)[0])
    target = _target_for_latest_row(latest_row, prediction_date, horizon)
    interval = _prediction_interval(
        spec=spec,
        completed_rows=completed_rows,
        target_column=target_column,
        predicted_return=predicted_return,
    )

    return build_prediction_row(
        ticker=ticker,
        prediction_date=prediction_date,
        target=target,
        model_name=spec.name,
        model_slug=spec.slug,
        reference_close=reference_close,
        predicted_return=predicted_return,
        interval=interval,
    )


def _feature_rows_to_frame(feature_rows: list[dict[str, Any]]) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    for row in feature_rows:
        feature_json = row.get("feature_json") or {}
        if not _has_current_feature_contract(feature_json):
            continue
        record = {
            "ticker": row["ticker"],
            "date": pd.to_datetime(row["date"]),
            "target_next_return": row.get("target_next_return"),
        }
        for horizon, column in TARGET_RETURN_COLUMNS.items():
            record[column] = row.get(column)
            record[TARGET_DATE_COLUMNS[horizon]] = row.get(TARGET_DATE_COLUMNS[horizon])
        record.update({name: float(feature_json[name]) for name in FEATURE_COLUMNS})
        records.append(record)

    return pd.DataFrame(records)


def _has_current_feature_contract(feature_json: dict[str, Any]) -> bool:
    return all(name in feature_json for name in FEATURE_COLUMNS)


def _latest_close_by_ticker(price_rows: list[dict[str, Any]]) -> dict[str, float]:
    if not price_rows:
        return {}

    prices = pd.DataFrame(price_rows)
    prices["date"] = pd.to_datetime(prices["date"])
    prices["close"] = pd.to_numeric(prices["close"], errors="coerce")
    prices = prices.dropna(subset=["ticker", "date", "close"])
    latest = prices.sort_values("date").groupby("ticker", sort=True).tail(1)
    return {row["ticker"]: float(row["close"]) for row in latest.to_dict("records")}


def _target_for_latest_row(
    latest_row: pd.Series,
    prediction_date: date,
    horizon: ForecastHorizon,
) -> HorizonTarget:
    target_column = TARGET_DATE_COLUMNS[horizon]
    target_date = _parse_optional_date(latest_row.get(target_column))
    resolved = resolve_horizon_target(prediction_date, horizon)
    if target_date is None or target_date == resolved.target_date:
        return resolved

    raw_target_date = add_horizon_offset(prediction_date, horizon)
    return HorizonTarget(
        horizon=horizon,
        start_date=prediction_date,
        raw_target_date=raw_target_date,
        target_date=target_date,
        horizon_calendar_days=(target_date - prediction_date).days,
        horizon_trading_days=count_trading_days(prediction_date, target_date),
    )


def _prediction_interval(
    *,
    spec: ModelSpec,
    completed_rows: pd.DataFrame,
    target_column: str,
    predicted_return: float,
):
    target_returns = [float(value) for value in completed_rows[target_column].tolist()]
    if spec.minimum_training_rows == 0:
        return historical_return_interval(target_returns=target_returns)

    fitted_returns = spec.make_model()
    fitted_returns.fit(completed_rows[list(FEATURE_COLUMNS)], completed_rows[target_column])
    fitted_values = [
        float(value)
        for value in fitted_returns.predict(completed_rows[list(FEATURE_COLUMNS)])
    ]
    return residual_prediction_interval(
        actual_returns=target_returns,
        fitted_returns=fitted_values,
        point_prediction=predicted_return,
    )


def _parse_optional_date(value: object) -> date | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).date()
