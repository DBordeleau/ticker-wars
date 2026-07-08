from __future__ import annotations

import unittest
from datetime import UTC, date, datetime
from unittest.mock import patch

import pandas as pd

from pipeline.ingestion.fundamentals import (
    _build_fundamentals_row,
    _has_any_fundamental_value,
    fetch_fundamentals,
)
from pipeline.ingestion.live_prices import (
    _build_live_snapshot_row,
    _frame_to_intraday_bar_rows,
    current_intraday_retention_cutoff,
)
from pipeline.ingestion.market_data import (
    _extract_ticker_frame,
    _frame_to_price_rows,
    fetch_daily_prices,
    fetch_incremental_daily_prices,
)


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
        fetched: list[tuple[tuple[str, ...], str]] = []

        def fake_fetch_batch(
            tickers: tuple[str, ...],
            start_date: str,
            _end_date: str | None,
            _max_attempts: int,
        ) -> dict[str, list[dict[str, object]]]:
            fetched.append((tickers, start_date))
            return {
                ticker: [{"ticker": ticker, "date": start_date}]
                for ticker in tickers
            }

        with (
            patch("pipeline.ingestion.market_data._fetch_tickers_with_retries", fake_fetch_batch),
            patch("pipeline.ingestion.market_data._fetch_ticker_with_retries") as fallback,
        ):
            result = fetch_incremental_daily_prices(
                start_date="2020-01-01",
                latest_dates={"AAPL": "2026-06-26"},
                tickers=("AAPL", "GME"),
            )

        self.assertEqual(fetched, [(("GME",), "2020-01-01"), (("AAPL",), "2026-06-26")])
        fallback.assert_not_called()
        self.assertEqual(
            result.rows,
            [
                {"ticker": "GME", "date": "2020-01-01"},
                {"ticker": "AAPL", "date": "2026-06-26"},
            ],
        )

    def test_incremental_prices_batch_tickers_with_the_same_start_date(self) -> None:
        fetched: list[tuple[tuple[str, ...], str]] = []

        def fake_fetch_batch(
            tickers: tuple[str, ...],
            start_date: str,
            _end_date: str | None,
            _max_attempts: int,
        ) -> dict[str, list[dict[str, object]]]:
            fetched.append((tickers, start_date))
            return {
                ticker: [{"ticker": ticker, "date": start_date}]
                for ticker in tickers
            }

        with patch("pipeline.ingestion.market_data._fetch_tickers_with_retries", fake_fetch_batch):
            result = fetch_incremental_daily_prices(
                start_date="2020-01-01",
                latest_dates={"AAPL": "2026-06-26", "MSFT": "2026-06-26"},
                tickers=("AAPL", "MSFT", "GME"),
                batch_size=25,
            )

        self.assertEqual(
            fetched,
            [
                (("GME",), "2020-01-01"),
                (("AAPL", "MSFT"), "2026-06-26"),
            ],
        )
        self.assertEqual([row["ticker"] for row in result.rows], ["GME", "AAPL", "MSFT"])

    def test_missing_batch_rows_fall_back_once_per_ticker(self) -> None:
        with (
            patch(
                "pipeline.ingestion.market_data._fetch_tickers_with_retries",
                return_value={"AAPL": [], "MSFT": []},
            ) as fetch_batch,
            patch(
                "pipeline.ingestion.market_data._fetch_ticker_with_retries",
                side_effect=[
                    [{"ticker": "AAPL", "date": "2026-06-26"}],
                    [],
                ],
            ) as fetch_ticker,
        ):
            result = fetch_daily_prices(
                start_date="2026-06-26",
                tickers=("AAPL", "MSFT"),
                batch_size=25,
            )

        fetch_batch.assert_called_once()
        self.assertEqual(fetch_ticker.call_count, 2)
        self.assertEqual(result.rows, [{"ticker": "AAPL", "date": "2026-06-26"}])
        self.assertEqual(result.failed_tickers, ["MSFT"])

    def test_multi_ticker_yfinance_frame_can_be_split_into_price_rows(self) -> None:
        frame = pd.DataFrame(
            {
                ("AAPL", "Open"): [100.0],
                ("AAPL", "High"): [104.0],
                ("AAPL", "Low"): [99.5],
                ("AAPL", "Close"): [103.0],
                ("AAPL", "Volume"): [1_250_000],
                ("MSFT", "Open"): [300.0],
                ("MSFT", "High"): [304.0],
                ("MSFT", "Low"): [299.5],
                ("MSFT", "Close"): [303.0],
                ("MSFT", "Volume"): [2_250_000],
            },
            index=[pd.Timestamp("2024-01-02")],
        )
        frame.columns = pd.MultiIndex.from_tuples(frame.columns)

        rows = _frame_to_price_rows("MSFT", _extract_ticker_frame(frame, "MSFT"))

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["ticker"], "MSFT")
        self.assertEqual(rows[0]["date"], "2024-01-02")
        self.assertEqual(rows[0]["close"], 303.0)

    def test_live_price_rows_match_database_contract(self) -> None:
        fetched_at = datetime(2026, 6, 29, 14, 31, 4, tzinfo=UTC)
        frame = pd.DataFrame(
            {
                "Open": [205.0, 205.25],
                "High": [205.75, 206.0],
                "Low": [204.9, 205.1],
                "Close": [205.5, 205.8],
                "Volume": [50_000, 42_000],
            },
            index=[
                pd.Timestamp("2026-06-29 10:30:00", tz="America/New_York"),
                pd.Timestamp("2026-06-29 10:31:00", tz="America/New_York"),
            ],
        )

        bars = _frame_to_intraday_bar_rows(
            ticker="AAPL",
            frame=frame,
            fetched_at=fetched_at,
        )
        snapshot = _build_live_snapshot_row(
            ticker="AAPL",
            bars=bars,
            fetched_at=fetched_at,
            period="1d",
            interval="1m",
        )

        self.assertEqual(len(bars), 2)
        self.assertEqual(bars[0]["ticker"], "AAPL")
        self.assertEqual(bars[0]["ts"], "2026-06-29T14:30:00+00:00")
        self.assertEqual(bars[0]["close"], 205.5)
        self.assertEqual(bars[0]["provider"], "yfinance")
        self.assertEqual(snapshot["ticker"], "AAPL")
        self.assertEqual(snapshot["price"], 205.8)
        self.assertEqual(snapshot["day_open"], 205.0)
        self.assertEqual(snapshot["day_high"], 206.0)
        self.assertEqual(snapshot["day_low"], 204.9)
        self.assertEqual(snapshot["day_volume"], 92_000)
        self.assertEqual(snapshot["market_state"], "regular")
        self.assertEqual(snapshot["provider_metadata"]["bar_count"], 2)

    def test_live_price_retention_cutoff_keeps_current_et_day_only(self) -> None:
        cutoff = current_intraday_retention_cutoff(
            datetime(2026, 6, 29, 14, 31, 4, tzinfo=UTC),
        )

        self.assertEqual(cutoff, "2026-06-29T04:00:00+00:00")

    def test_live_snapshot_downgrades_previous_session_bar_during_regular_hours(self) -> None:
        fetched_at = datetime(2026, 6, 29, 13, 40, 0, tzinfo=UTC)
        bars = [
            {
                "ticker": "AAPL",
                "ts": "2026-06-26T19:59:00+00:00",
                "provider": "yfinance",
                "provider_symbol": "AAPL",
                "open": 281.0,
                "high": 282.0,
                "low": 280.5,
                "close": 281.2,
                "volume": 1000,
                "fetched_at": fetched_at.isoformat(),
            }
        ]

        snapshot = _build_live_snapshot_row(
            ticker="AAPL",
            bars=bars,
            fetched_at=fetched_at,
            period="1d",
            interval="1m",
        )

        self.assertEqual(snapshot["market_state"], "closed")


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
                "longName": "Apple Inc.",
                "shortName": "Apple",
                "displayName": "Apple",
                "longBusinessSummary": "Makes consumer hardware and services.",
                "website": "https://www.apple.com",
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
        self.assertEqual(row["long_name"], "Apple Inc.")
        self.assertEqual(row["business_summary"], "Makes consumer hardware and services.")
        self.assertEqual(row["website"], "https://www.apple.com")
        self.assertEqual(row["source"], "yfinance")
        self.assertIsNone(row["raw_json"])

    def test_profile_only_fundamentals_row_is_kept_for_etfs(self) -> None:
        row = {
            "ticker": "SPY",
            "as_of_date": "2026-06-21",
            "market_cap": None,
            "sector": None,
            "industry": None,
            "long_name": "SPDR S&P 500 ETF Trust",
            "business_summary": "Tracks the S&P 500 Index.",
            "source": "yfinance",
            "raw_json": None,
            "ingested_at": "2026-06-21T00:00:00+00:00",
        }

        self.assertTrue(_has_any_fundamental_value(row))

    def test_fetch_fundamentals_skips_fresh_cached_rows(self) -> None:
        with patch("pipeline.ingestion.fundamentals._fetch_ticker_with_retries") as fetch_ticker:
            result = fetch_fundamentals(
                tickers=("AAPL",),
                existing_rows=[
                    {
                        "ticker": "AAPL",
                        "as_of_date": "2026-06-20",
                        "business_summary": "Makes consumer hardware and services.",
                    }
                ],
                as_of_date=date(2026, 6, 21),
            )

        self.assertEqual(result.rows, [])
        self.assertEqual(result.skipped_tickers, ["AAPL"])
        fetch_ticker.assert_not_called()

    def test_fetch_fundamentals_refreshes_fresh_cached_rows_missing_summary(self) -> None:
        row = {
            "ticker": "AAPL",
            "as_of_date": "2026-06-21",
            "market_cap": 1.0,
            "business_summary": "Makes consumer hardware and services.",
        }
        with patch(
            "pipeline.ingestion.fundamentals._fetch_ticker_with_retries",
            return_value=row,
        ) as fetch_ticker:
            result = fetch_fundamentals(
                tickers=("AAPL",),
                existing_rows=[
                    {
                        "ticker": "AAPL",
                        "as_of_date": "2026-06-20",
                        "long_name": "Apple Inc.",
                        "business_summary": None,
                    }
                ],
                as_of_date=date(2026, 6, 21),
            )

        self.assertEqual(result.rows, [row])
        self.assertEqual(result.skipped_tickers, [])
        fetch_ticker.assert_called_once()

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
