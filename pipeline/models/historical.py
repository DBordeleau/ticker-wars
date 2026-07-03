from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import pandas as pd

from pipeline.config import Settings
from pipeline.features.build_features import (
    FEATURE_COLUMNS,
    TARGET_DATE_COLUMNS,
    TARGET_RETURN_COLUMNS,
)
from pipeline.forecasting.horizons import FORECAST_HORIZONS, ForecastHorizon, HorizonTarget
from pipeline.models.base import (
    DEFAULT_INTERVAL_LEVEL,
    PredictionInterval,
    build_prediction_row,
    historical_return_interval,
    residual_prediction_interval,
)
from pipeline.models.chronos_model import ChronosModelLoader, ChronosPredictionAdapter
from pipeline.models.registry import MODEL_SLUGS, MODEL_SPECS, ModelSpec
from pipeline.models.timesfm_model import TimesFMModelLoader, TimesFMPredictionAdapter

DEFAULT_SEED_MODEL_SLUGS: tuple[str, ...] = (
    "baseline",
    "linear-regression",
    "random-forest",
    "timesfm",
    "chronos-2",
)


@dataclass(frozen=True)
class SeedTarget:
    prediction_date: date
    horizon: ForecastHorizon
    target: HorizonTarget


@dataclass(frozen=True)
class HistoricalPredictionResult:
    prediction_rows: list[dict[str, Any]]
    skipped: list[str] = field(default_factory=list)


def seed_predictions_for_target_window(
    *,
    feature_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
    settings: Settings,
    target_start: date,
    target_end: date,
    tickers: tuple[str, ...] | None = None,
    model_slugs: tuple[str, ...] | None = None,
    timesfm_model_loader: TimesFMModelLoader | None = None,
    chronos_model_loader: ChronosModelLoader | None = None,
) -> HistoricalPredictionResult:
    """Generate historical as-of predictions for target dates in a closed window."""

    features = _feature_rows_to_frame(feature_rows)
    prices = _price_rows_to_frame(price_rows)
    selected_model_slugs = _selected_model_slugs(model_slugs, settings)
    predictions: list[dict[str, Any]] = []
    skipped: list[str] = []

    if features.empty:
        return HistoricalPredictionResult([], ["No feature rows available."])
    if prices.empty:
        return HistoricalPredictionResult([], ["No price rows available."])

    if tickers is not None:
        ticker_set = set(tickers)
        features = features[features["ticker"].isin(ticker_set)]
        prices = prices[prices["ticker"].isin(ticker_set)]

    candidate_dates = sorted(pd.Timestamp(value).date() for value in features["date"].unique())
    seed_targets = resolve_seed_targets_for_window(
        candidate_dates=candidate_dates,
        target_start=target_start,
        target_end=target_end,
    )
    if not seed_targets:
        return HistoricalPredictionResult([], ["No seed targets resolved for target window."])

    seed_targets_by_prediction_date: dict[date, list[SeedTarget]] = {}
    for target in seed_targets:
        seed_targets_by_prediction_date.setdefault(target.prediction_date, []).append(target)

    if any(slug in selected_model_slugs for slug in _classic_model_slugs()):
        classic_rows, classic_skips = _seed_classic_predictions(
            features=features,
            prices=prices,
            seed_targets=seed_targets,
            selected_model_slugs=selected_model_slugs,
        )
        predictions.extend(classic_rows)
        skipped.extend(classic_skips)

    if "timesfm" in selected_model_slugs and settings.timesfm_enabled:
        timesfm_rows, timesfm_skips = _seed_timesfm_predictions(
            prices=prices,
            seed_targets_by_prediction_date=seed_targets_by_prediction_date,
            settings=settings,
            model_loader=timesfm_model_loader,
        )
        predictions.extend(timesfm_rows)
        skipped.extend(timesfm_skips)

    if "chronos-2" in selected_model_slugs and settings.chronos_enabled:
        chronos_rows, chronos_skips = _seed_chronos_predictions(
            prices=prices,
            seed_targets_by_prediction_date=seed_targets_by_prediction_date,
            settings=settings,
            model_loader=chronos_model_loader,
        )
        predictions.extend(chronos_rows)
        skipped.extend(chronos_skips)

    return HistoricalPredictionResult(predictions, skipped)


def resolve_seed_targets_for_window(
    *,
    candidate_dates: list[date],
    target_start: date,
    target_end: date,
) -> list[SeedTarget]:
    if target_end < target_start:
        raise ValueError("target_end must be on or after target_start.")

    min_candidate_date = target_start - timedelta(days=370)
    targets: list[SeedTarget] = []
    for prediction_date in candidate_dates:
        if prediction_date < min_candidate_date or prediction_date > target_end:
            continue

        for horizon in FORECAST_HORIZONS:
            target = _resolve_target(prediction_date, horizon)
            if target_start <= target.target_date <= target_end:
                targets.append(
                    SeedTarget(
                        prediction_date=prediction_date,
                        horizon=horizon,
                        target=target,
                    )
                )

    return targets


def _seed_classic_predictions(
    *,
    features: pd.DataFrame,
    prices: pd.DataFrame,
    seed_targets: list[SeedTarget],
    selected_model_slugs: set[str],
) -> tuple[list[dict[str, Any]], list[str]]:
    predictions: list[dict[str, Any]] = []
    skipped: list[str] = []
    specs = [spec for spec in MODEL_SPECS if spec.slug in selected_model_slugs]
    close_by_ticker_date = _close_by_ticker_date(prices)

    for ticker, ticker_features in features.groupby("ticker", sort=True):
        ticker_features = ticker_features.sort_values("date")
        ticker_seed_targets = [
            target
            for target in seed_targets
            if _has_feature_on_date(ticker_features, target.prediction_date)
        ]
        if not ticker_seed_targets:
            continue

        for seed_target in ticker_seed_targets:
            latest_row = _feature_row_on_date(ticker_features, seed_target.prediction_date)
            reference_close = close_by_ticker_date.get((ticker, seed_target.prediction_date))
            if reference_close is None:
                skipped.append(f"{ticker}: no close found for {seed_target.prediction_date}.")
                continue

            for spec in specs:
                prediction = _predict_classic_as_of(
                    spec=spec,
                    all_features=features,
                    ticker_features=ticker_features,
                    latest_row=latest_row,
                    ticker=ticker,
                    seed_target=seed_target,
                    reference_close=reference_close,
                )
                if prediction is None:
                    skipped.append(
                        f"{ticker}: skipped {spec.name} {seed_target.horizon.upper()} "
                        f"as of {seed_target.prediction_date}; fewer than "
                        f"{spec.minimum_training_rows} completed rows."
                    )
                    continue
                predictions.append(prediction)

    return predictions, skipped


def _predict_classic_as_of(
    *,
    spec: ModelSpec,
    all_features: pd.DataFrame,
    ticker_features: pd.DataFrame,
    latest_row: pd.Series,
    ticker: str,
    seed_target: SeedTarget,
    reference_close: float,
) -> dict[str, Any] | None:
    target_column = TARGET_RETURN_COLUMNS[seed_target.horizon]
    target_date_column = TARGET_DATE_COLUMNS[seed_target.horizon]
    completed_rows = ticker_features[
        (ticker_features["date"] <= pd.Timestamp(seed_target.prediction_date))
        & ticker_features[target_column].notna()
        & ticker_features[target_date_column].notna()
        & (ticker_features[target_date_column] <= pd.Timestamp(seed_target.prediction_date))
    ]
    training_rows = completed_rows
    training_scope = "ticker"
    if len(training_rows) < spec.minimum_training_rows and spec.minimum_training_rows > 0:
        training_rows = _completed_rows_as_of(
            all_features,
            horizon=seed_target.horizon,
            prediction_date=seed_target.prediction_date,
        )
        training_scope = "pooled"

    if len(training_rows) < spec.minimum_training_rows:
        return None

    model = spec.make_model()
    if spec.minimum_training_rows > 0:
        model.fit(training_rows[list(FEATURE_COLUMNS)], training_rows[target_column])

    prediction_features = pd.DataFrame([latest_row[list(FEATURE_COLUMNS)].to_dict()])
    predicted_return = float(model.predict(prediction_features)[0])
    interval = _prediction_interval(
        spec=spec,
        completed_rows=training_rows,
        target_column=target_column,
        predicted_return=predicted_return,
    )

    return build_prediction_row(
        ticker=ticker,
        prediction_date=seed_target.prediction_date,
        target=seed_target.target,
        model_name=spec.name,
        model_slug=spec.slug,
        reference_close=reference_close,
        predicted_return=predicted_return,
        model_metadata={
            "training_scope": training_scope,
            "training_row_count": int(len(training_rows)),
        },
    ) | _interval_row_fields(interval, reference_close)


def _seed_timesfm_predictions(
    *,
    prices: pd.DataFrame,
    seed_targets_by_prediction_date: dict[date, list[SeedTarget]],
    settings: Settings,
    model_loader: TimesFMModelLoader | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    adapter = TimesFMPredictionAdapter(settings=settings, model_loader=model_loader)
    return _seed_adapter_predictions(
        prices=prices,
        seed_targets_by_prediction_date=seed_targets_by_prediction_date,
        predict_from_price_rows=adapter.predict_from_price_rows,
        model_name="TimesFM",
    )


def _seed_chronos_predictions(
    *,
    prices: pd.DataFrame,
    seed_targets_by_prediction_date: dict[date, list[SeedTarget]],
    settings: Settings,
    model_loader: ChronosModelLoader | None,
) -> tuple[list[dict[str, Any]], list[str]]:
    adapter = ChronosPredictionAdapter(settings=settings, model_loader=model_loader)
    return _seed_adapter_predictions(
        prices=prices,
        seed_targets_by_prediction_date=seed_targets_by_prediction_date,
        predict_from_price_rows=adapter.predict_from_price_rows,
        model_name="Chronos-2",
    )


def _seed_adapter_predictions(
    *,
    prices: pd.DataFrame,
    seed_targets_by_prediction_date: dict[date, list[SeedTarget]],
    predict_from_price_rows: Any,
    model_name: str,
) -> tuple[list[dict[str, Any]], list[str]]:
    predictions: list[dict[str, Any]] = []
    skipped: list[str] = []

    for ticker, ticker_prices in prices.groupby("ticker", sort=True):
        ticker_prices = ticker_prices.sort_values("date")
        ticker_dates = {pd.Timestamp(value).date() for value in ticker_prices["date"]}
        for prediction_date, targets in seed_targets_by_prediction_date.items():
            if prediction_date not in ticker_dates:
                continue

            as_of_prices = ticker_prices[ticker_prices["date"] <= pd.Timestamp(prediction_date)]
            if as_of_prices.empty:
                continue

            target_keys = {
                (target.horizon, target.target.target_date.isoformat())
                for target in targets
            }
            try:
                adapter_rows = predict_from_price_rows(as_of_prices.to_dict("records"))
            except Exception as exc:
                skipped.append(f"{ticker}: {model_name} skipped {prediction_date}: {exc}")
                continue

            predictions.extend(
                row
                for row in adapter_rows
                if row.get("ticker") == ticker
                and row.get("prediction_date") == prediction_date.isoformat()
                and (row.get("prediction_horizon"), row.get("target_date")) in target_keys
            )

    return predictions, skipped


def _feature_rows_to_frame(feature_rows: list[dict[str, Any]]) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    for row in feature_rows:
        feature_json = row.get("feature_json") or {}
        if not all(name in feature_json for name in FEATURE_COLUMNS):
            continue

        record: dict[str, Any] = {
            "ticker": str(row["ticker"]),
            "date": pd.to_datetime(row["date"]),
        }
        for horizon, column in TARGET_RETURN_COLUMNS.items():
            record[column] = row.get(column)
            record[TARGET_DATE_COLUMNS[horizon]] = _parse_optional_timestamp(
                row.get(TARGET_DATE_COLUMNS[horizon])
            )
        record.update({name: float(feature_json[name]) for name in FEATURE_COLUMNS})
        records.append(record)

    frame = pd.DataFrame(records)
    if frame.empty:
        return frame

    return frame.sort_values(["ticker", "date"])


def _price_rows_to_frame(price_rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(price_rows)
    if frame.empty:
        return frame

    frame = frame.copy()
    frame["ticker"] = frame["ticker"].astype(str)
    frame["date"] = pd.to_datetime(frame["date"])
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
    frame = frame.dropna(subset=["ticker", "date", "close"])
    return frame.sort_values(["ticker", "date"])


def _prediction_interval(
    *,
    spec: ModelSpec,
    completed_rows: pd.DataFrame,
    target_column: str,
    predicted_return: float,
):
    target_returns = [float(value) for value in completed_rows[target_column].tolist()]
    if spec.minimum_training_rows == 0:
        return historical_return_interval(target_returns=target_returns) or _fallback_interval(
            predicted_return
        )

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
    ) or _fallback_interval(predicted_return)


def _fallback_interval(predicted_return: float) -> PredictionInterval:
    return PredictionInterval(
        predicted_return_lower=predicted_return - 0.20,
        predicted_return_upper=predicted_return + 0.20,
        interval_level=DEFAULT_INTERVAL_LEVEL,
        interval_method="fallback-wide-return-band",
    )


def _completed_rows_as_of(
    features: pd.DataFrame,
    *,
    horizon: ForecastHorizon,
    prediction_date: date,
) -> pd.DataFrame:
    target_column = TARGET_RETURN_COLUMNS[horizon]
    target_date_column = TARGET_DATE_COLUMNS[horizon]
    return features[
        (features["date"] <= pd.Timestamp(prediction_date))
        & features[target_column].notna()
        & features[target_date_column].notna()
        & (features[target_date_column] <= pd.Timestamp(prediction_date))
    ]


def _interval_row_fields(interval: Any, reference_close: float) -> dict[str, Any]:
    if interval is None:
        return {}
    return {
        "predicted_return_lower": interval.predicted_return_lower,
        "predicted_return_upper": interval.predicted_return_upper,
        "predicted_close_lower": reference_close * (1 + interval.predicted_return_lower),
        "predicted_close_upper": reference_close * (1 + interval.predicted_return_upper),
        "interval_level": interval.interval_level,
        "interval_method": interval.interval_method,
    }


def _selected_model_slugs(model_slugs: tuple[str, ...] | None, settings: Settings) -> set[str]:
    selected = set(model_slugs or DEFAULT_SEED_MODEL_SLUGS)
    if not settings.timesfm_enabled:
        selected.discard("timesfm")
    if not settings.chronos_enabled:
        selected.discard("chronos-2")
    selected.discard("warren-buffbot")
    return selected


def _classic_model_slugs() -> set[str]:
    return {spec.slug for spec in MODEL_SPECS}


def _close_by_ticker_date(prices: pd.DataFrame) -> dict[tuple[str, date], float]:
    return {
        (str(row["ticker"]), pd.Timestamp(row["date"]).date()): float(row["close"])
        for row in prices.to_dict("records")
    }


def _has_feature_on_date(ticker_features: pd.DataFrame, prediction_date: date) -> bool:
    return bool((ticker_features["date"] == pd.Timestamp(prediction_date)).any())


def _feature_row_on_date(ticker_features: pd.DataFrame, prediction_date: date) -> pd.Series:
    return ticker_features[ticker_features["date"] == pd.Timestamp(prediction_date)].iloc[-1]


def _resolve_target(prediction_date: date, horizon: ForecastHorizon) -> HorizonTarget:
    from pipeline.forecasting.horizons import resolve_horizon_target

    return resolve_horizon_target(prediction_date, horizon)


def _parse_optional_timestamp(value: object) -> pd.Timestamp | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value)


def normalize_model_slugs(value: str | None) -> tuple[str, ...] | None:
    if value is None:
        return None

    normalized = tuple(
        dict.fromkeys(
            item.strip().lower()
            for item in value.split(",")
            if item.strip()
        )
    )
    if not normalized:
        return None

    aliases = {name.lower(): slug for name, slug in MODEL_SLUGS.items()}
    return tuple(aliases.get(slug, slug) for slug in normalized)
