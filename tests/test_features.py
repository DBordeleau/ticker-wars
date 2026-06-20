from __future__ import annotations

import unittest

import pandas as pd

from pipeline.features.build_features import build_feature_rows
from pipeline.features.indicators import rsi


def _price_rows(ticker: str, closes: list[float], volumes: list[int] | None = None) -> list[dict]:
    volumes = volumes or [1_000_000 + index for index in range(len(closes))]
    dates = pd.date_range("2024-01-02", periods=len(closes), freq="B")
    return [
        {
            "ticker": ticker,
            "date": date.date().isoformat(),
            "close": close,
            "volume": volume,
        }
        for date, close, volume in zip(dates, closes, volumes, strict=True)
    ]


class FeatureEngineeringTest(unittest.TestCase):
    def test_rsi_handles_simple_price_patterns(self) -> None:
        self.assertEqual(rsi(pd.Series([10.0] * 20)).iloc[-1], 50.0)
        self.assertEqual(rsi(pd.Series([float(value) for value in range(1, 21)])).iloc[-1], 100.0)
        self.assertEqual(rsi(pd.Series([float(value) for value in range(20, 0, -1)])).iloc[-1], 0.0)

    def test_target_next_return_is_aligned_to_following_trading_day(self) -> None:
        closes = [100.0 + index for index in range(30)]
        price_rows = _price_rows("AAPL", closes)
        price_rows += _price_rows("SPY", [400.0 + index for index in range(30)])

        rows = build_feature_rows(price_rows)
        first_row = rows[0]

        self.assertEqual(first_row["ticker"], "AAPL")
        self.assertEqual(first_row["date"], "2024-01-30")
        self.assertAlmostEqual(first_row["feature_json"]["return_1d"], 120.0 / 119.0 - 1)
        self.assertAlmostEqual(first_row["target_next_return"], 121.0 / 120.0 - 1)

    def test_rolling_features_do_not_use_future_rows(self) -> None:
        closes = [100.0 + index for index in range(30)]
        market_rows = _price_rows("SPY", [400.0 + index for index in range(30)])
        baseline_rows = _price_rows("AAPL", closes) + market_rows

        changed_closes = closes.copy()
        changed_closes[25] = 999.0
        changed_rows = _price_rows("AAPL", changed_closes) + market_rows

        baseline_first = build_feature_rows(baseline_rows)[0]
        changed_first = build_feature_rows(changed_rows)[0]

        self.assertEqual(baseline_first["date"], changed_first["date"])
        self.assertEqual(baseline_first["feature_json"], changed_first["feature_json"])
        self.assertEqual(baseline_first["target_next_return"], changed_first["target_next_return"])

    def test_rows_with_incomplete_rolling_windows_are_dropped(self) -> None:
        price_rows = _price_rows("AAPL", [100.0 + index for index in range(20)])
        price_rows += _price_rows("SPY", [400.0 + index for index in range(20)])

        self.assertEqual(build_feature_rows(price_rows), [])


if __name__ == "__main__":
    unittest.main()
