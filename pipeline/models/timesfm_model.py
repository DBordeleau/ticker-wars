from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import numpy as np
import pandas as pd

from pipeline.config import Settings
from pipeline.forecasting.horizons import FORECAST_HORIZONS, ForecastHorizon, HorizonTarget
from pipeline.models.base import PredictionInterval, build_prediction_row
from pipeline.models.registry import MODEL_SLUGS

MODEL_NAME = "TimesFM"
MODEL_SLUG = MODEL_SLUGS[MODEL_NAME]
INTERVAL_LEVEL = 0.80

LOGGER = logging.getLogger(__name__)

TimesFMModelLoader = Callable[[Settings, int], Any]


def generate_timesfm_predictions(
    price_rows: list[dict[str, Any]],
    settings: Settings,
    model_loader: TimesFMModelLoader | None = None,
) -> list[dict[str, Any]]:
    if not settings.timesfm_enabled:
        LOGGER.info("TimesFM is disabled.")
        return []

    if not price_rows:
        return []

    adapter = TimesFMPredictionAdapter(settings=settings, model_loader=model_loader)
    try:
        return adapter.predict_from_price_rows(price_rows)
    except TimesFMDependencyError as exc:
        LOGGER.warning("TimesFM predictions skipped: %s", exc)
        return []


class TimesFMDependencyError(RuntimeError):
    pass


class TimesFMPredictionAdapter:
    name = MODEL_NAME
    slug = MODEL_SLUG
    supports_intervals = True
    supported_horizons = FORECAST_HORIZONS

    def __init__(
        self,
        settings: Settings,
        model_loader: TimesFMModelLoader | None = None,
    ) -> None:
        self.settings = settings
        self.model_loader = model_loader or _load_default_timesfm_model
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
            max_horizon = max(target.horizon_trading_days for target in targets.values())
            if max_horizon <= 0:
                continue

            close_history = ticker_prices["close"].tail(
                self.settings.timesfm_context_length
            ).to_numpy(dtype=float)
            point_forecast, quantile_forecast = self._model_forecast(
                close_history,
                max_horizon,
            )

            for target in targets.values():
                step_index = target.horizon_trading_days - 1
                predicted_close = float(point_forecast[step_index])
                predicted_return = predicted_close / reference_close - 1
                interval = _interval_from_quantiles(
                    quantile_forecast=quantile_forecast,
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
                            "checkpoint_id": self.settings.timesfm_model_id,
                            "context_length": int(len(close_history)),
                            "configured_context_length": self.settings.timesfm_context_length,
                            "inference_backend": self.settings.timesfm_backend,
                            "interval_source": "timesfm-quantiles",
                            "max_horizon": max_horizon,
                        },
                    )
                )

        return predictions

    def _model_forecast(
        self,
        close_history: np.ndarray,
        horizon: int,
    ) -> tuple[np.ndarray, np.ndarray | None]:
        model = self._get_model(max_horizon=horizon)
        point_forecast, quantile_forecast = model.forecast(
            horizon=horizon,
            inputs=[close_history],
        )
        return _first_series(point_forecast), _first_quantile_series(quantile_forecast)

    def _get_model(self, max_horizon: int) -> Any:
        if self._model is None:
            self._model = self.model_loader(self.settings, max_horizon)
        return self._model


def _load_default_timesfm_model(settings: Settings, max_horizon: int) -> Any:
    try:
        import timesfm
    except ImportError as exc:
        raise TimesFMDependencyError(
            "Install optional dependency `timesfm[torch]` to enable TimesFM."
        ) from exc

    backend = settings.timesfm_backend.lower()
    if backend != "torch":
        raise TimesFMDependencyError(
            f"Unsupported TIMESFM_BACKEND={settings.timesfm_backend!r}; use 'torch'."
        )

    try:
        model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(settings.timesfm_model_id)
        model.compile(
            timesfm.ForecastConfig(
                max_context=settings.timesfm_context_length,
                max_horizon=max_horizon,
                normalize_inputs=True,
                use_continuous_quantile_head=True,
                force_flip_invariance=True,
                infer_is_positive=True,
                fix_quantile_crossing=True,
            )
        )
    except AttributeError as exc:
        raise TimesFMDependencyError(
            "Installed TimesFM package does not expose the expected 2.5 torch API."
        ) from exc

    return model


def _price_rows_to_frame(price_rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(price_rows)
    if frame.empty:
        return frame

    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
    frame = frame.dropna(subset=["ticker", "date", "close"])
    return frame.sort_values(["ticker", "date"])


def _resolve_targets(prediction_date: Any) -> dict[ForecastHorizon, HorizonTarget]:
    from pipeline.forecasting.horizons import resolve_horizon_target

    return {
        horizon: resolve_horizon_target(prediction_date, horizon)
        for horizon in FORECAST_HORIZONS
    }


def _interval_from_quantiles(
    *,
    quantile_forecast: np.ndarray | None,
    step_index: int,
    reference_close: float,
) -> PredictionInterval | None:
    if quantile_forecast is None:
        return None

    quantiles = np.asarray(quantile_forecast[step_index], dtype=float)
    if quantiles.size < 2:
        return None

    if quantiles.size >= 10:
        lower_close = float(quantiles[1])
        upper_close = float(quantiles[9])
    else:
        lower_close = float(quantiles[0])
        upper_close = float(quantiles[-1])

    if lower_close > upper_close:
        lower_close, upper_close = upper_close, lower_close

    return PredictionInterval(
        predicted_return_lower=lower_close / reference_close - 1,
        predicted_return_upper=upper_close / reference_close - 1,
        interval_level=INTERVAL_LEVEL,
        interval_method="timesfm-quantiles",
    )


def _first_series(values: Any) -> np.ndarray:
    series = np.asarray(values, dtype=float)
    if series.ndim == 2:
        return series[0]
    if series.ndim == 1:
        return series
    raise ValueError(f"Expected point forecast with 1 or 2 dimensions, got {series.ndim}.")


def _first_quantile_series(values: Any) -> np.ndarray | None:
    if values is None:
        return None

    series = np.asarray(values, dtype=float)
    if series.ndim == 3:
        return series[0]
    if series.ndim == 2:
        return series
    raise ValueError(f"Expected quantile forecast with 2 or 3 dimensions, got {series.ndim}.")
