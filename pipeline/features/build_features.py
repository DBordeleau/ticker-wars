from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from pipeline.features.indicators import rsi
from pipeline.forecasting.horizons import FORECAST_HORIZONS, ForecastHorizon, resolve_horizon_target

FEATURE_COLUMNS: tuple[str, ...] = (
    "return_1d",
    "return_2d",
    "return_5d",
    "return_10d",
    "return_20d",
    "return_1w",
    "return_1m",
    "return_3m",
    "return_6m",
    "return_1y",
    "ma_ratio_5d",
    "ma_ratio_20d",
    "volatility_5d",
    "volatility_20d",
    "volatility_60d",
    "volatility_252d",
    "rsi_14",
    "distance_52w_high",
    "distance_52w_low",
    "volume_change_1d",
    "volume_change_20d",
    "volume_ratio_5d",
    "avg_dollar_volume_20d",
    "spy_return_1w",
    "spy_return_1m",
    "spy_return_3m",
    "spy_return_1y",
    "qqq_return_1w",
    "qqq_return_1m",
    "qqq_return_3m",
    "qqq_return_1y",
    "relative_spy_return_1w",
    "relative_spy_return_1m",
    "relative_spy_return_3m",
    "relative_spy_return_1y",
    "relative_qqq_return_1w",
    "relative_qqq_return_1m",
    "relative_qqq_return_3m",
    "relative_qqq_return_1y",
)

TARGET_RETURN_COLUMNS: dict[ForecastHorizon, str] = {
    "1w": "target_return_1w",
    "1m": "target_return_1m",
    "3m": "target_return_3m",
    "1y": "target_return_1y",
}

TARGET_DATE_COLUMNS: dict[ForecastHorizon, str] = {
    "1w": "target_date_1w",
    "1m": "target_date_1m",
    "3m": "target_date_3m",
    "1y": "target_date_1y",
}

MARKET_TICKERS: tuple[str, ...] = ("SPY", "QQQ")
MARKET_FEATURE_COLUMNS: tuple[str, ...] = (
    "spy_return_1w",
    "spy_return_1m",
    "spy_return_3m",
    "spy_return_1y",
    "qqq_return_1w",
    "qqq_return_1m",
    "qqq_return_3m",
    "qqq_return_1y",
)


def build_feature_rows(
    price_rows: list[dict[str, Any]],
    market_ticker: str = "SPY",
) -> list[dict[str, Any]]:
    if not price_rows:
        return []

    prices = _price_rows_to_frame(price_rows)
    market_features = _build_all_market_features(prices, market_ticker)
    created_at = datetime.now(UTC).isoformat()
    feature_rows: list[dict[str, Any]] = []

    for ticker, ticker_prices in prices.groupby("ticker", sort=True):
        if ticker in MARKET_TICKERS or ticker == market_ticker:
            continue

        features = _build_ticker_features(ticker_prices)
        features = features.join(market_features, how="left")
        features[list(MARKET_FEATURE_COLUMNS)] = features[list(MARKET_FEATURE_COLUMNS)].fillna(0.0)
        features = _add_relative_market_features(features)
        features = features.fillna({column: 0.0 for column in _relative_market_columns()})
        features = features.dropna(subset=FEATURE_COLUMNS)

        for row in features.reset_index().to_dict("records"):
            feature_rows.append(
                {
                    "ticker": ticker,
                    "date": row["date"].date().isoformat(),
                    "feature_json": {
                        column: _clean_float(row[column]) for column in FEATURE_COLUMNS
                    },
                    **_target_date_fields(row),
                    **_target_return_fields(row),
                    "created_at": created_at,
                }
            )

    return feature_rows


def _price_rows_to_frame(price_rows: list[dict[str, Any]]) -> pd.DataFrame:
    frame = pd.DataFrame(price_rows)
    required_columns = {"ticker", "date", "close", "volume"}
    missing_columns = required_columns - set(frame.columns)
    if missing_columns:
        raise ValueError(f"Price rows are missing columns: {sorted(missing_columns)}")

    frame = frame.copy()
    frame["date"] = pd.to_datetime(frame["date"])
    frame["close"] = pd.to_numeric(frame["close"], errors="coerce")
    frame["volume"] = pd.to_numeric(frame["volume"], errors="coerce")
    frame = frame.dropna(subset=["ticker", "date", "close", "volume"])
    return frame.sort_values(["ticker", "date"])


def _build_ticker_features(ticker_prices: pd.DataFrame) -> pd.DataFrame:
    ticker_prices = ticker_prices.sort_values("date").set_index("date")
    close = ticker_prices["close"]
    volume = ticker_prices["volume"]
    dollar_volume = close * volume
    daily_return = close.pct_change()

    features = pd.DataFrame(index=ticker_prices.index)
    features["return_1d"] = daily_return
    features["return_2d"] = close.pct_change(2)
    features["return_5d"] = close.pct_change(5)
    features["return_10d"] = close.pct_change(10)
    features["return_20d"] = close.pct_change(20)
    features["return_1w"] = close.pct_change(5)
    features["return_1m"] = close.pct_change(21)
    features["return_3m"] = close.pct_change(63)
    features["return_6m"] = close.pct_change(126)
    features["return_1y"] = close.pct_change(252)
    features["ma_ratio_5d"] = close / close.rolling(5).mean() - 1
    features["ma_ratio_20d"] = close / close.rolling(20).mean() - 1
    features["volatility_5d"] = daily_return.rolling(5).std()
    features["volatility_20d"] = daily_return.rolling(20).std()
    features["volatility_60d"] = daily_return.rolling(60).std()
    features["volatility_252d"] = daily_return.rolling(252).std()
    features["rsi_14"] = rsi(close, window=14)
    features["distance_52w_high"] = close / close.rolling(252).max() - 1
    features["distance_52w_low"] = close / close.rolling(252).min() - 1
    features["volume_change_1d"] = volume.pct_change()
    features["volume_change_20d"] = volume.pct_change(20)
    features["volume_ratio_5d"] = volume / volume.rolling(5).mean() - 1
    features["avg_dollar_volume_20d"] = dollar_volume.rolling(20).mean()
    features["target_next_return"] = close.shift(-1) / close - 1
    features = _add_horizon_targets(features, close)
    return features


def _build_market_features(prices: pd.DataFrame, market_ticker: str) -> pd.DataFrame:
    market_prices = prices[prices["ticker"] == market_ticker].sort_values("date")
    if market_prices.empty:
        return pd.DataFrame()

    market_prices = market_prices.set_index("date")
    market_close = market_prices["close"]
    market_features = pd.DataFrame(index=market_prices.index)
    prefix = market_ticker.lower()
    market_features[f"{prefix}_return_1w"] = market_close.pct_change(5)
    market_features[f"{prefix}_return_1m"] = market_close.pct_change(21)
    market_features[f"{prefix}_return_3m"] = market_close.pct_change(63)
    market_features[f"{prefix}_return_1y"] = market_close.pct_change(252)
    return market_features


def _build_all_market_features(prices: pd.DataFrame, market_ticker: str) -> pd.DataFrame:
    tickers = tuple(dict.fromkeys((market_ticker, "QQQ")))
    market_frames = [_build_market_features(prices, ticker) for ticker in tickers]
    market_features = pd.concat(market_frames, axis=1)

    for column in MARKET_FEATURE_COLUMNS:
        if column not in market_features:
            market_features[column] = 0.0

    return market_features[list(MARKET_FEATURE_COLUMNS)]


def _add_relative_market_features(features: pd.DataFrame) -> pd.DataFrame:
    features = features.copy()
    for suffix, ticker_return in {
        "1w": "return_1w",
        "1m": "return_1m",
        "3m": "return_3m",
        "1y": "return_1y",
    }.items():
        features[f"relative_spy_return_{suffix}"] = (
            features[ticker_return] - features[f"spy_return_{suffix}"]
        )
        features[f"relative_qqq_return_{suffix}"] = (
            features[ticker_return] - features[f"qqq_return_{suffix}"]
        )

    return features


def _relative_market_columns() -> tuple[str, ...]:
    return tuple(
        f"relative_{market}_return_{suffix}"
        for market in ("spy", "qqq")
        for suffix in ("1w", "1m", "3m", "1y")
    )


def _add_horizon_targets(features: pd.DataFrame, close: pd.Series) -> pd.DataFrame:
    features = features.copy()
    available_dates = [pd.Timestamp(value).date() for value in close.index]
    close_by_date = {
        pd.Timestamp(index).date(): _clean_float(value)
        for index, value in close.items()
        if not pd.isna(value)
    }

    for horizon in FORECAST_HORIZONS:
        target_dates = [
            resolve_horizon_target(pd.Timestamp(index).date(), horizon, available_dates).target_date
            for index in features.index
        ]
        target_closes = [close_by_date.get(target_date) for target_date in target_dates]

        features[TARGET_DATE_COLUMNS[horizon]] = target_dates
        features[TARGET_RETURN_COLUMNS[horizon]] = [
            target_close / close_value - 1 if target_close is not None else None
            for target_close, close_value in zip(target_closes, close, strict=True)
        ]

    return features


def _target_date_fields(row: dict[str, Any]) -> dict[str, str | None]:
    fields: dict[str, str | None] = {}
    for column in TARGET_DATE_COLUMNS.values():
        value = row.get(column)
        fields[column] = value.isoformat() if value is not None and not pd.isna(value) else None
    return fields


def _target_return_fields(row: dict[str, Any]) -> dict[str, float | None]:
    return {
        column: _clean_nullable_float(row.get(column))
        for column in TARGET_RETURN_COLUMNS.values()
    }


def _clean_float(value: object) -> float:
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        raise ValueError(f"Expected a finite feature value, got {value!r}")
    return number


def _clean_nullable_float(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    return _clean_float(value)
