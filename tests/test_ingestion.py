from __future__ import annotations

import unittest

import pandas as pd

from pipeline.ingestion.market_data import _frame_to_price_rows


class MarketDataIngestionTest(unittest.TestCase):
    def test_price_rows_match_database_contract(self) -> None:
        frame = pd.DataFrame(
            {
                "Open": [100.0],
                "High": [104.0],
                "Low": [99.5],
                "Close": [103.0],
                "Volume": [1_250_000],
            },
            index=[pd.Timestamp("2024-01-02")],
        )

        rows = _frame_to_price_rows("AAPL", frame)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ticker"], "AAPL")
        self.assertEqual(rows[0]["date"], "2024-01-02")
        self.assertEqual(rows[0]["close"], 103.0)
        self.assertEqual(rows[0]["volume"], 1_250_000)
        self.assertEqual(rows[0]["source"], "yfinance")
        self.assertIn("ingested_at", rows[0])

    def test_incomplete_price_rows_are_skipped(self) -> None:
        frame = pd.DataFrame(
            {
                "Open": [100.0, 101.0],
                "High": [104.0, 102.0],
                "Low": [99.5, 100.5],
                "Close": [103.0, float("nan")],
                "Volume": [1_250_000, 1_100_000],
            },
            index=[pd.Timestamp("2024-01-02"), pd.Timestamp("2024-01-03")],
        )

        rows = _frame_to_price_rows("AAPL", frame)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["date"], "2024-01-02")


if __name__ == "__main__":
    unittest.main()
