from __future__ import annotations

import unittest

from pipeline.ingestion.ticker_universe import MVP_TICKERS, to_yfinance_symbol
from pipeline.models.baseline import predict_zero_return


class ProjectScaffoldTest(unittest.TestCase):
    def test_mvp_universe_has_26_tickers_including_spy(self) -> None:
        self.assertEqual(len(MVP_TICKERS), 26)
        self.assertIn("SPY", MVP_TICKERS)

    def test_provider_ticker_normalization(self) -> None:
        self.assertEqual(to_yfinance_symbol("BRK-B"), "BRK-B")

    def test_baseline_predicts_zero_return(self) -> None:
        self.assertEqual(predict_zero_return(), 0.0)


if __name__ == "__main__":
    unittest.main()
