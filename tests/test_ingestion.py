from __future__ import annotations

import unittest
from datetime import UTC, date, datetime
from unittest.mock import patch

import pandas as pd

from pipeline.ingestion.fundamentals import _build_fundamentals_row, fetch_fundamentals
from pipeline.ingestion.market_data import _frame_to_price_rows, fetch_incremental_daily_prices


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

    def test_incremental_prices_start_from_latest_stored_date(self) -> None:
        fetched: list[tuple[str, str]] = []

        def fake_fetch(
            ticker: str,
            start_date: str,
            _end_date: str | None,
            _max_attempts: int,
        ) -> list[dict[str, object]]:
            fetched.append((ticker, start_date))
            return [{"ticker": ticker, "date": start_date}]

        with patch("pipeline.ingestion.market_data._fetch_ticker_with_retries", fake_fetch):
            result = fetch_incremental_daily_prices(
                start_date="2020-01-01",
                latest_dates={"AAPL": "2026-06-26"},
                tickers=("AAPL", "GME"),
            )

        self.assertEqual(fetched, [("AAPL", "2026-06-26"), ("GME", "2020-01-01")])
        self.assertEqual(
            result.rows,
            [
                {"ticker": "AAPL", "date": "2026-06-26"},
                {"ticker": "GME", "date": "2020-01-01"},
            ],
        )


class FakeTickerData:
    def __init__(self, info: dict) -> None:
        self._info = info
        self.ttm_income_stmt = pd.DataFrame(
            {pd.Timestamp("2024-12-31"): [10_000_000_000.0, 1_500_000_000.0]},
            index=["Total Revenue", "Net Income"],
        )
        self.balance_sheet = pd.DataFrame(
            {pd.Timestamp("2024-12-31"): [2_000_000_000.0]},
            index=["Total Debt"],
        )
        self.ttm_cashflow = pd.DataFrame(
            {pd.Timestamp("2024-12-31"): [900_000_000.0]},
            index=["Free Cash Flow"],
        )

    def get_info(self) -> dict:
        return self._info


class FundamentalsIngestionTest(unittest.TestCase):
    def test_fundamentals_row_prefers_info_and_falls_back_to_statements(self) -> None:
        ticker_data = FakeTickerData(
            {
                "marketCap": 3_000_000_000.0,
                "trailingPE": 24.5,
                "forwardPE": None,
                "profitMargins": 0.18,
                "sector": "Technology",
                "industry": "Software",
            }
        )

        row = _build_fundamentals_row(
            ticker="AAPL",
            ticker_data=ticker_data,
            as_of_date=date(2026, 6, 21),
            ingested_at=datetime(2026, 6, 21, tzinfo=UTC),
        )

        self.assertEqual(row["ticker"], "AAPL")
        self.assertEqual(row["as_of_date"], "2026-06-21")
        self.assertEqual(row["market_cap"], 3_000_000_000.0)
        self.assertEqual(row["trailing_pe"], 24.5)
        self.assertEqual(row["revenue_ttm"], 10_000_000_000.0)
        self.assertEqual(row["net_income_ttm"], 1_500_000_000.0)
        self.assertEqual(row["free_cash_flow"], 900_000_000.0)
        self.assertEqual(row["total_debt"], 2_000_000_000.0)
        self.assertEqual(row["sector"], "Technology")
        self.assertEqual(row["source"], "yfinance")
        self.assertIn("raw_json", row)

    def test_fetch_fundamentals_skips_fresh_cached_rows(self) -> None:
        with patch("pipeline.ingestion.fundamentals._fetch_ticker_with_retries") as fetch_ticker:
            result = fetch_fundamentals(
                tickers=("AAPL",),
                existing_rows=[{"ticker": "AAPL", "as_of_date": "2026-06-20"}],
                as_of_date=date(2026, 6, 21),
            )

        self.assertEqual(result.rows, [])
        self.assertEqual(result.skipped_tickers, ["AAPL"])
        fetch_ticker.assert_not_called()

    def test_fetch_fundamentals_refreshes_stale_cached_rows(self) -> None:
        row = {"ticker": "AAPL", "as_of_date": "2026-06-21", "market_cap": 1.0}
        with patch(
            "pipeline.ingestion.fundamentals._fetch_ticker_with_retries",
            return_value=row,
        ) as fetch_ticker:
            result = fetch_fundamentals(
                tickers=("AAPL",),
                existing_rows=[{"ticker": "AAPL", "as_of_date": "2026-06-01"}],
                as_of_date=date(2026, 6, 21),
            )

        self.assertEqual(result.rows, [row])
        self.assertEqual(result.skipped_tickers, [])
        fetch_ticker.assert_called_once()


if __name__ == "__main__":
    unittest.main()
