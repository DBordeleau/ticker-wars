from __future__ import annotations

from datetime import date, datetime, timedelta


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def next_business_day(value: date) -> date:
    candidate = value + timedelta(days=1)
    while candidate.weekday() >= 5:
        candidate += timedelta(days=1)
    return candidate


def next_trading_day(value: date) -> date:
    candidate = value + timedelta(days=1)
    while not is_trading_day(candidate):
        candidate += timedelta(days=1)
    return candidate


def is_trading_day(value: date) -> bool:
    return value.weekday() < 5 and value not in nyse_holidays(value.year)


def nyse_holidays(year: int) -> set[date]:
    holidays = {
        _observed_new_years_day(year),
        _nth_weekday(year, 1, weekday=0, occurrence=3),
        _nth_weekday(year, 2, weekday=0, occurrence=3),
        _good_friday(year),
        _last_weekday(year, 5, weekday=0),
        _observed_fixed_holiday(year, 6, 19),
        _observed_fixed_holiday(year, 7, 4),
        _nth_weekday(year, 9, weekday=0, occurrence=1),
        _nth_weekday(year, 11, weekday=3, occurrence=4),
        _observed_fixed_holiday(year, 12, 25),
    }
    return {holiday for holiday in holidays if holiday.year == year}


def _observed_new_years_day(year: int) -> date:
    holiday = date(year, 1, 1)
    if holiday.weekday() == 6:
        return holiday + timedelta(days=1)
    return holiday


def _observed_fixed_holiday(year: int, month: int, day: int) -> date:
    holiday = date(year, month, day)
    if holiday.weekday() == 5:
        return holiday - timedelta(days=1)
    if holiday.weekday() == 6:
        return holiday + timedelta(days=1)
    return holiday


def _nth_weekday(year: int, month: int, weekday: int, occurrence: int) -> date:
    current = date(year, month, 1)
    while current.weekday() != weekday:
        current += timedelta(days=1)
    return current + timedelta(days=7 * (occurrence - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    if month == 12:
        current = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        current = date(year, month + 1, 1) - timedelta(days=1)

    while current.weekday() != weekday:
        current -= timedelta(days=1)
    return current


def _good_friday(year: int) -> date:
    return _easter_sunday(year) - timedelta(days=2)


def _easter_sunday(year: int) -> date:
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    correction = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * correction) // 451
    month = (h + correction - 7 * m + 114) // 31
    day = ((h + correction - 7 * m + 114) % 31) + 1
    return date(year, month, day)
