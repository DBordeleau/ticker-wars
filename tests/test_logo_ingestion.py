from __future__ import annotations

import unittest
from unittest.mock import patch

from pipeline.ingestion.logos import domain_from_fundamentals, fetch_ticker_logos


class LogoIngestionTest(unittest.TestCase):
    def test_domain_from_fundamentals_uses_raw_website(self) -> None:
        row = {
            "ticker": "AAPL",
            "raw_json": {"website": "https://www.apple.com/investor-relations/"},
        }

        self.assertEqual(domain_from_fundamentals(row), "apple.com")

    def test_fetch_ticker_logos_skips_existing_cached_rows(self) -> None:
        with patch("pipeline.ingestion.logos.fetch_hunter_logo") as fetch_logo:
            result = fetch_ticker_logos(
                fundamental_rows=[
                    {"ticker": "AAPL", "raw_json": {"website": "https://www.apple.com"}},
                ],
                existing_rows=[{"ticker": "AAPL", "logo_data_url": "data:image/png;base64,abc"}],
            )

        self.assertEqual(result.rows, [])
        self.assertEqual(result.skipped_tickers, ["AAPL"])
        fetch_logo.assert_not_called()

    def test_fetch_ticker_logos_builds_rows_from_domains(self) -> None:
        row = {"ticker": "AAPL", "logo_data_url": "data:image/png;base64,abc"}
        with patch("pipeline.ingestion.logos.fetch_hunter_logo", return_value=row) as fetch_logo:
            result = fetch_ticker_logos(
                fundamental_rows=[
                    {"ticker": "AAPL", "raw_json": {"website": "https://www.apple.com"}},
                ],
                existing_rows=[],
            )

        self.assertEqual(result.rows, [row])
        fetch_logo.assert_called_once_with("AAPL", "apple.com", timeout_seconds=8.0)


if __name__ == "__main__":
    unittest.main()
