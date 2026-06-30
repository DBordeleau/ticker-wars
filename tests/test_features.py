from __future__ import annotations

import unittest
from datetime import date

import pandas as pd

from pipeline.features.build_features import build_feature_rows
from pipeline.features.indicators import rsi
from pipeline.forecasting.horizons import resolve_horizon_target


def _price_rows(
    ticker: str,
    closes: list[float],
    volumes: list[int] | None = None,
    start: str = "2024-01-02",
) -> list[dict]:
    volumes = volumes or [1_000_000 + index for index in range(len(closes))]
    dates = pd.date_range(start, periods=len(closes), freq="B")
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

    def test_horizon_targets_are_aligned_to_available_trading_dates(self) -> None:
        closes = [100.0 + index for index in range(420)]
        price_rows = _price_rows("AAPL", closes)
        price_rows += _price_rows("SPY", [400.0 + index for index in range(420)])

        rows = build_feature_rows(price_rows)
        first_row = rows[0]
        close_by_date = {row["date"]: row["close"] for row in price_rows if row["ticker"] == "AAPL"}
        available_dates = {date.fromisoformat(value) for value in close_by_date}
        row_date = date.fromisoformat(first_row["date"])
        target_1w = resolve_horizon_target(row_date, "1w", available_dates)

        self.assertEqual(first_row["ticker"], "AAPL")
        self.assertIn("return_1y", first_row["feature_json"])
        self.assertIn("relative_spy_return_1m", first_row["feature_json"])
        self.assertNotIn("relative_qqq_return_1m", first_row["feature_json"])
        self.assertEqual(first_row["target_date_1w"], target_1w.target_date.isoformat())
        self.assertAlmostEqual(
            first_row["target_return_1w"],
            close_by_date[target_1w.target_date.isoformat()] / close_by_date[first_row["date"]] - 1,
        )
        self.assertIn("target_return_1m", first_row)
        self.assertIn("target_return_3m", first_row)
        self.assertIn("target_return_1y", first_row)

    def test_rolling_features_do_not_use_future_rows(self) -> None:
        closes = [100.0 + index for index in range(420)]
        market_rows = _price_rows("SPY", [400.0 + index for index in range(420)])
        baseline_rows = _price_rows("AAPL", closes) + market_rows

        changed_closes = closes.copy()
        changed_closes[260] = 999.0
        changed_rows = _price_rows("AAPL", changed_closes) + market_rows

        baseline_first = build_feature_rows(baseline_rows)[0]
        changed_first = build_feature_rows(changed_rows)[0]

        self.assertEqual(baseline_first["date"], changed_first["date"])
        self.assertEqual(baseline_first["feature_json"], changed_first["feature_json"])
        self.assertEqual(baseline_first["target_return_1w"], changed_first["target_return_1w"])

    def test_rows_with_incomplete_rolling_windows_are_dropped(self) -> None:
        price_rows = _price_rows("AAPL", [100.0 + index for index in range(220)])
        price_rows += _price_rows("SPY", [400.0 + index for index in range(220)])

        self.assertEqual(build_feature_rows(price_rows), [])

    def test_spy_is_a_prediction_target(self) -> None:
        price_rows = _price_rows("AAPL", [100.0 + index for index in range(420)])
        price_rows += _price_rows("SPY", [400.0 + index for index in range(420)])

        tickers = {row["ticker"] for row in build_feature_rows(price_rows)}

        self.assertIn("SPY", tickers)


if __name__ == "__main__":
    unittest.main()
