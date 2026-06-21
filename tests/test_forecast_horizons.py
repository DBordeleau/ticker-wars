from __future__ import annotations

import unittest
from datetime import date

from pipeline.forecasting.horizons import (
    FORECAST_HORIZONS,
    HORIZON_LABELS,
    add_horizon_offset,
    resolve_all_horizon_targets,
    resolve_horizon_target,
)


class ForecastHorizonTest(unittest.TestCase):
    def test_horizon_labels_include_dashboard_all_without_storing_all(self) -> None:
        self.assertEqual(FORECAST_HORIZONS, ("1w", "1m", "3m", "1y"))
        self.assertEqual(HORIZON_LABELS["all"], "ALL")
        self.assertEqual(HORIZON_LABELS["1w"], "1W")

    def test_calendar_offsets_use_human_horizon_boundaries(self) -> None:
        start = date(2026, 1, 31)

        self.assertEqual(add_horizon_offset(start, "1w"), date(2026, 2, 7))
        self.assertEqual(add_horizon_offset(start, "1m"), date(2026, 2, 28))
        self.assertEqual(add_horizon_offset(start, "3m"), date(2026, 4, 30))
        self.assertEqual(add_horizon_offset(start, "1y"), date(2027, 1, 31))

    def test_target_rolls_forward_over_holiday_and_weekend(self) -> None:
        target = resolve_horizon_target(date(2026, 6, 12), "1w")

        self.assertEqual(target.raw_target_date, date(2026, 6, 19))
        self.assertEqual(target.target_date, date(2026, 6, 22))
        self.assertEqual(target.horizon_calendar_days, 10)

    def test_target_uses_next_available_market_data_date_when_supplied(self) -> None:
        available_dates = {
            date(2026, 1, 30),
            date(2026, 2, 3),
            date(2026, 2, 4),
        }

        target = resolve_horizon_target(date(2026, 1, 2), "1m", available_dates)

        self.assertEqual(target.raw_target_date, date(2026, 2, 2))
        self.assertEqual(target.target_date, date(2026, 2, 3))
        self.assertEqual(target.horizon_trading_days, 2)

    def test_resolves_all_horizons(self) -> None:
        targets = resolve_all_horizon_targets(date(2026, 1, 2))

        self.assertEqual(set(targets), {"1w", "1m", "3m", "1y"})


if __name__ == "__main__":
    unittest.main()

