from __future__ import annotations

import unittest
from datetime import date

from pipeline.dates import is_trading_day, next_trading_day


class TradingCalendarTest(unittest.TestCase):
    def test_next_trading_day_skips_juneteenth_2026_and_weekend(self) -> None:
        self.assertFalse(is_trading_day(date(2026, 6, 19)))
        self.assertEqual(next_trading_day(date(2026, 6, 18)), date(2026, 6, 22))

    def test_next_trading_day_skips_observed_independence_day_2026(self) -> None:
        self.assertFalse(is_trading_day(date(2026, 7, 3)))
        self.assertEqual(next_trading_day(date(2026, 7, 2)), date(2026, 7, 6))

    def test_next_trading_day_handles_ordinary_weekday(self) -> None:
        self.assertEqual(next_trading_day(date(2026, 6, 16)), date(2026, 6, 17))


if __name__ == "__main__":
    unittest.main()
