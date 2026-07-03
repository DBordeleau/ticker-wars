from __future__ import annotations

import unittest

from pipeline.ingestion.ticker_universe import MVP_TICKERS, to_yfinance_symbol
from pipeline.models.baseline import predict_zero_return


class ProjectScaffoldTest(unittest.TestCase):
    def test_mvp_universe_has_50_tickers_including_expansion_and_spy(self) -> None:
        self.assertEqual(len(MVP_TICKERS), 50)
        self.assertIn("SPY", MVP_TICKERS)
        self.assertIn("GME", MVP_TICKERS)
        self.assertIn("RDDT", MVP_TICKERS)
        self.assertIn("COIN", MVP_TICKERS)
        self.assertIn("CRWD", MVP_TICKERS)
        self.assertIn("CAVA", MVP_TICKERS)
        self.assertNotIn("QQQ", MVP_TICKERS)
        self.assertNotIn("KO", MVP_TICKERS)

    def test_provider_ticker_normalization(self) -> None:
        self.assertEqual(to_yfinance_symbol("BRK-B"), "BRK-B")

    def test_baseline_predicts_zero_return(self) -> None:
        self.assertEqual(predict_zero_return(), 0.0)


if __name__ == "__main__":
    unittest.main()
