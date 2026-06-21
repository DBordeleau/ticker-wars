from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

from pipeline.dates import is_trading_day

ForecastHorizon = Literal["1w", "1m", "3m", "1y"]

FORECAST_HORIZONS: tuple[ForecastHorizon, ...] = ("1w", "1m", "3m", "1y")
HORIZON_LABELS: dict[ForecastHorizon | Literal["all"], str] = {
    "all": "ALL",
    "1w": "1W",
    "1m": "1M",
    "3m": "3M",
    "1y": "1Y",
}


@dataclass(frozen=True)
class HorizonTarget:
    horizon: ForecastHorizon
    start_date: date
    raw_target_date: date
    target_date: date
    horizon_calendar_days: int
    horizon_trading_days: int


def resolve_horizon_target(
    start_date: date,
    horizon: ForecastHorizon,
    available_dates: Iterable[date] | None = None,
) -> HorizonTarget:
    """Resolve a forecast horizon into a target date.

    If available dates are supplied, the target rolls forward to the first available
    market-data date on or after the calendar horizon. Otherwise it rolls forward by
    the built-in NYSE weekday/holiday calendar.
    """

    raw_target_date = add_horizon_offset(start_date, horizon)
    target_date = roll_forward_to_trading_day(raw_target_date, available_dates)
    calendar_days = (target_date - start_date).days
    trading_days = count_trading_days(start_date, target_date, available_dates)

    return HorizonTarget(
        horizon=horizon,
        start_date=start_date,
        raw_target_date=raw_target_date,
        target_date=target_date,
        horizon_calendar_days=calendar_days,
        horizon_trading_days=trading_days,
    )


def resolve_all_horizon_targets(
    start_date: date,
    available_dates: Iterable[date] | None = None,
) -> dict[ForecastHorizon, HorizonTarget]:
    return {
        horizon: resolve_horizon_target(start_date, horizon, available_dates)
        for horizon in FORECAST_HORIZONS
    }


def add_horizon_offset(start_date: date, horizon: ForecastHorizon) -> date:
    if horizon == "1w":
        return start_date + timedelta(days=7)
    if horizon == "1m":
        return _add_months(start_date, 1)
    if horizon == "3m":
        return _add_months(start_date, 3)
    if horizon == "1y":
        return _add_months(start_date, 12)

    raise ValueError(f"Unsupported forecast horizon: {horizon!r}")


def roll_forward_to_trading_day(
    target_date: date,
    available_dates: Iterable[date] | None = None,
) -> date:
    if available_dates is not None:
        dates = sorted({value for value in available_dates if value >= target_date})
        if dates:
            return dates[0]

    candidate = target_date
    while not is_trading_day(candidate):
        candidate += timedelta(days=1)
    return candidate


def count_trading_days(
    start_date: date,
    target_date: date,
    available_dates: Iterable[date] | None = None,
) -> int:
    if available_dates is not None:
        return sum(1 for value in set(available_dates) if start_date < value <= target_date)

    count = 0
    candidate = start_date + timedelta(days=1)
    while candidate <= target_date:
        if is_trading_day(candidate):
            count += 1
        candidate += timedelta(days=1)
    return count


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - timedelta(days=1)).day
