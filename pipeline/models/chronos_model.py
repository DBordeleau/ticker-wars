from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import pandas as pd

from pipeline.config import Settings
from pipeline.forecasting.horizons import FORECAST_HORIZONS, ForecastHorizon, HorizonTarget
from pipeline.models.base import PredictionInterval, build_prediction_row
from pipeline.models.registry import MODEL_SLUGS

MODEL_NAME = "Chronos-2"
MODEL_SLUG = MODEL_SLUGS[MODEL_NAME]
INTERVAL_LEVEL = 0.80
QUANTILE_LEVELS = [0.1, 0.5, 0.9]

LOGGER = logging.getLogger(__name__)

ChronosModelLoader = Callable[[Settings], Any]


def generate_chronos_predictions(
    price_rows: list[dict[str, Any]],
    settings: Settings,
    model_loader: ChronosModelLoader | None = None,
) -> list[dict[str, Any]]:
    if not settings.chronos_enabled:
        LOGGER.info("Chronos-2 is disabled.")
        return []

    if not price_rows:
        return []

    adapter = ChronosPredictionAdapter(settings=settings, model_loader=model_loader)
    try:
        return adapter.predict_from_price_rows(price_rows)
    except ChronosDependencyError as exc:
        LOGGER.warning("Chronos-2 predictions skipped: %s", exc)
        return []


class ChronosDependencyError(RuntimeError):
    pass


class ChronosPredictionAdapter:
    name = MODEL_NAME
    slug = MODEL_SLUG
    supports_intervals = True
    supported_horizons = FORECAST_HORIZONS

    def __init__(
        self,
        settings: Settings,
        model_loader: ChronosModelLoader | None = None,
    ) -> None:
        self.settings = settings
        self.model_loader = model_loader or _load_default_chronos_model
        self._model: Any | None = None

    def predict_from_price_rows(self, price_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        prices = _price_rows_to_frame(price_rows)
        if prices.empty:
            return []

        predictions: list[dict[str, Any]] = []
        for ticker, ticker_prices in prices.groupby("ticker", sort=True):
            ticker_prices = ticker_prices.sort_values("date")
            latest_date = pd.Timestamp(ticker_prices.iloc[-1]["date"]).date()
            reference_close = float(ticker_prices.iloc[-1]["close"])
            targets = _resolve_targets(latest_date)
            prediction_length = max(target.horizon_trading_days for target in targets.values())
            if prediction_length <= 0:
                continue

            context = _chronos_context_frame(
                ticker=ticker,
                ticker_prices=ticker_prices,
                context_length=self.settings.chronos_context_length,
            )
            forecast = self._model_forecast(context, prediction_length)

            for target in targets.values():
                step_index = target.horizon_trading_days - 1
                point_close = _forecast_value(forecast, step_index, "predictions", "0.5")
                predicted_return = point_close / reference_close - 1
                interval = _interval_from_forecast(
                    forecast=forecast,
                    step_index=step_index,
                    reference_close=reference_close,
                )
                predictions.append(
                    build_prediction_row(
                        ticker=ticker,
                        prediction_date=latest_date,
                        target=target,
                        model_name=self.name,
                        model_slug=self.slug,
                        reference_close=reference_close,
                        predicted_return=predicted_return,
                        interval=interval,
                        model_metadata={
                            "checkpoint_id": self.settings.chronos_model_id,
                            "context_length": len(context),
                            "configured_context_length": self.settings.chronos_context_length,
                            "generated_sequence_length": prediction_length,
                            "device_map": self.settings.chronos_device_map,
                            "frequency": self.settings.chronos_frequency,
                            "interval_source": "chronos-2-quantiles",
                        },
                    )
                )

        return predictions

    def _model_forecast(self, context: pd.DataFrame, prediction_length: int) -> pd.DataFrame:
        model = self._get_model()
        forecast = model.predict_df(
            context,
            prediction_length=prediction_length,
            quantile_levels=QUANTILE_LEVELS,
            id_column="id",
            timestamp_column="timestamp",
            target="target",
            freq=self.settings.chronos_frequency,
        )
        return _forecast_frame(forecast)

    def _get_model(self) -> Any:
        if self._model is None:
            self._model = self.model_loader(self.settings)
        return self._model


def _load_default_chronos_model(settings: Settings) -> Any:
    try:
        from chronos import Chronos2Pipeline
    except ImportError as exc:
        raise ChronosDependencyError(
            "Install optional dependency `chronos-forecasting>=2.3.0` to enable Chronos-2."
        ) from exc

    return Chronos2Pipeline.from_pretrained(
        settings.chronos_model_id,
        device_map=settings.chronos_device_map,
    )


def _price_rows_to_frame(price_rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(price_rows)
    if frame.empty:
        return frame

    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
    frame = frame.dropna(subset=["ticker", "date", "close"])
    return frame.sort_values(["ticker", "date"])


def _chronos_context_frame(
    *,
    ticker: str,
    ticker_prices: pd.DataFrame,
    context_length: int,
) -> pd.DataFrame:
    context = ticker_prices.tail(context_length).copy()
    return pd.DataFrame(
        {
            "id": ticker,
            "timestamp": pd.to_datetime(context["date"]),
            "target": context["close"].astype(float),
        }
    )


def _resolve_targets(prediction_date: Any) -> dict[ForecastHorizon, HorizonTarget]:
    from pipeline.forecasting.horizons import resolve_horizon_target

    return {
        horizon: resolve_horizon_target(prediction_date, horizon)
        for horizon in FORECAST_HORIZONS
    }


def _forecast_frame(forecast: Any) -> pd.DataFrame:
    frame = forecast.to_pandas() if hasattr(forecast, "to_pandas") else pd.DataFrame(forecast)
    if "timestamp" in frame.columns:
        frame = frame.sort_values("timestamp")
    return frame.reset_index(drop=True)


def _forecast_value(forecast: pd.DataFrame, step_index: int, *columns: str) -> float:
    for column in columns:
        if column in forecast.columns:
            return float(forecast.iloc[step_index][column])
    raise ValueError(f"Chronos-2 forecast did not contain any of {columns}.")


def _interval_from_forecast(
    *,
    forecast: pd.DataFrame,
    step_index: int,
    reference_close: float,
) -> PredictionInterval | None:
    if "0.1" not in forecast.columns or "0.9" not in forecast.columns:
        return None

    lower_close = float(forecast.iloc[step_index]["0.1"])
    upper_close = float(forecast.iloc[step_index]["0.9"])
    if lower_close > upper_close:
        lower_close, upper_close = upper_close, lower_close

    return PredictionInterval(
        predicted_return_lower=lower_close / reference_close - 1,
        predicted_return_upper=upper_close / reference_close - 1,
        interval_level=INTERVAL_LEVEL,
        interval_method="chronos-2-quantiles",
    )
