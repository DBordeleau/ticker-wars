from __future__ import annotations

import math
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from pipeline.features.indicators import rsi

FEATURE_COLUMNS: tuple[str, ...] = (
    "return_1d",
    "return_2d",
    "return_5d",
    "return_10d",
    "return_20d",
    "ma_ratio_5d",
    "ma_ratio_20d",
    "volatility_5d",
    "volatility_20d",
    "rsi_14",
    "volume_change_1d",
    "volume_ratio_5d",
    "market_return_1d",
    "market_return_5d",
)


def build_feature_rows(
    price_rows: list[dict[str, Any]],
    market_ticker: str = "SPY",
) -> list[dict[str, Any]]:
    if not price_rows:
        return []

    prices = _price_rows_to_frame(price_rows)
    market_features = _build_market_features(prices, market_ticker)
    created_at = datetime.now(UTC).isoformat()
    feature_rows: list[dict[str, Any]] = []

    for ticker, ticker_prices in prices.groupby("ticker", sort=True):
        if ticker == market_ticker:
            continue

        features = _build_ticker_features(ticker_prices)
        features = features.join(market_features, how="left")
        features = features.dropna(subset=FEATURE_COLUMNS)

        for row in features.reset_index().to_dict("records"):
            feature_rows.append(
                {
                    "ticker": ticker,
                    "date": row["date"].date().isoformat(),
                    "feature_json": {
                        column: _clean_float(row[column]) for column in FEATURE_COLUMNS
                    },
                    "target_next_return": _clean_nullable_float(row["target_next_return"]),
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
    daily_return = close.pct_change()

    features = pd.DataFrame(index=ticker_prices.index)
    features["return_1d"] = daily_return
    features["return_2d"] = close.pct_change(2)
    features["return_5d"] = close.pct_change(5)
    features["return_10d"] = close.pct_change(10)
    features["return_20d"] = close.pct_change(20)
    features["ma_ratio_5d"] = close / close.rolling(5).mean() - 1
    features["ma_ratio_20d"] = close / close.rolling(20).mean() - 1
    features["volatility_5d"] = daily_return.rolling(5).std()
    features["volatility_20d"] = daily_return.rolling(20).std()
    features["rsi_14"] = rsi(close, window=14)
    features["volume_change_1d"] = volume.pct_change()
    features["volume_ratio_5d"] = volume / volume.rolling(5).mean() - 1
    features["target_next_return"] = close.shift(-1) / close - 1
    return features


def _build_market_features(prices: pd.DataFrame, market_ticker: str) -> pd.DataFrame:
    market_prices = prices[prices["ticker"] == market_ticker].sort_values("date")
    if market_prices.empty:
        return pd.DataFrame(columns=["market_return_1d", "market_return_5d"])

    market_prices = market_prices.set_index("date")
    market_close = market_prices["close"]
    market_features = pd.DataFrame(index=market_prices.index)
    market_features["market_return_1d"] = market_close.pct_change()
    market_features["market_return_5d"] = market_close.pct_change(5)
    return market_features


def _clean_float(value: object) -> float:
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        raise ValueError(f"Expected a finite feature value, got {value!r}")
    return number


def _clean_nullable_float(value: object) -> float | None:
    if value is None or pd.isna(value):
        return None
    return _clean_float(value)
