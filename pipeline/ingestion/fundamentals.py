from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd

from pipeline.ingestion.ticker_universe import MVP_TICKERS, to_yfinance_symbol

LOGGER = logging.getLogger(__name__)
SOURCE_NAME = "yfinance"
DEFAULT_FRESHNESS_DAYS = 7


@dataclass(frozen=True)
class FundamentalsResult:
    rows: list[dict[str, Any]]
    failed_tickers: list[str]
    skipped_tickers: list[str]


def fetch_fundamentals(
    tickers: tuple[str, ...] = MVP_TICKERS,
    existing_rows: list[dict[str, Any]] | None = None,
    as_of_date: date | None = None,
    freshness_days: int = DEFAULT_FRESHNESS_DAYS,
    force: bool = False,
    max_attempts: int = 3,
) -> FundamentalsResult:
    rows: list[dict[str, Any]] = []
    failed_tickers: list[str] = []
    skipped_tickers: list[str] = []
    as_of_date = as_of_date or date.today()
    cached_rows = _latest_cached_rows(existing_rows or [])

    LOGGER.info("Fetching fundamentals for %s tickers.", len(tickers))
    for ticker in tickers:
        cached_row = cached_rows.get(ticker)
        cached_date = _parse_optional_date(cached_row.get("as_of_date")) if cached_row else None
        if (
            not force
            and _is_cache_fresh(cached_date, as_of_date, freshness_days)
            and _has_business_summary(cached_row)
        ):
            skipped_tickers.append(ticker)
            LOGGER.info("Skipping %s fundamentals; cached row is fresh.", ticker)
            continue

        row = _fetch_ticker_with_retries(ticker, as_of_date, max_attempts)
        if row:
            rows.append(row)
            LOGGER.info("Fetched fundamentals for %s.", ticker)
        else:
            failed_tickers.append(ticker)
            LOGGER.warning("No fundamentals fetched for %s.", ticker)

    return FundamentalsResult(
        rows=rows,
        failed_tickers=failed_tickers,
        skipped_tickers=skipped_tickers,
    )


def _fetch_ticker_with_retries(
    ticker: str,
    as_of_date: date,
    max_attempts: int,
) -> dict[str, Any] | None:
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return _fetch_ticker_fundamentals(ticker, as_of_date)
        except Exception as exc:
            last_error = exc
            LOGGER.warning(
                "Fundamentals fetch attempt %s/%s failed for %s: %s",
                attempt,
                max_attempts,
                ticker,
                exc,
            )
            if attempt < max_attempts:
                time.sleep(0.75 * attempt)

    LOGGER.error(
        "Giving up on %s fundamentals after %s attempts: %s",
        ticker,
        max_attempts,
        last_error,
    )
    return None


def _fetch_ticker_fundamentals(ticker: str, as_of_date: date) -> dict[str, Any] | None:
    import yfinance as yf

    ticker_data = yf.Ticker(to_yfinance_symbol(ticker))
    row = _build_fundamentals_row(
        ticker=ticker,
        ticker_data=ticker_data,
        as_of_date=as_of_date,
        ingested_at=datetime.now(UTC),
    )
    return row if _has_any_fundamental_value(row) else None


def _build_fundamentals_row(
    ticker: str,
    ticker_data: Any,
    as_of_date: date,
    ingested_at: datetime,
) -> dict[str, Any]:
    info = _safe_info(ticker_data)
    income = _safe_statement(ticker_data, "ttm_income_stmt", "income_stmt")
    balance = _safe_statement(ticker_data, "balance_sheet")
    cashflow = _safe_statement(ticker_data, "ttm_cashflow", "cashflow")

    row = {
        "ticker": ticker,
        "as_of_date": as_of_date.isoformat(),
        "market_cap": _clean_float(info.get("marketCap")),
        "trailing_pe": _clean_float(info.get("trailingPE")),
        "forward_pe": _clean_float(info.get("forwardPE")),
        "price_to_book": _clean_float(info.get("priceToBook")),
        "price_to_sales": _clean_float(info.get("priceToSalesTrailing12Months")),
        "revenue_ttm": _first_clean_float(
            info.get("totalRevenue"),
            _statement_value(income, "Total Revenue"),
            _statement_value(income, "Operating Revenue"),
        ),
        "revenue_growth": _clean_float(info.get("revenueGrowth")),
        "net_income_ttm": _first_clean_float(
            info.get("netIncomeToCommon"),
            _statement_value(income, "Net Income"),
            _statement_value(income, "Net Income Common Stockholders"),
        ),
        "profit_margin": _clean_float(info.get("profitMargins")),
        "operating_margin": _clean_float(info.get("operatingMargins")),
        "free_cash_flow": _first_clean_float(
            info.get("freeCashflow"),
            _statement_value(cashflow, "Free Cash Flow"),
        ),
        "total_debt": _first_clean_float(
            info.get("totalDebt"),
            _statement_value(balance, "Total Debt"),
        ),
        "debt_to_equity": _clean_float(info.get("debtToEquity")),
        "current_ratio": _clean_float(info.get("currentRatio")),
        "sector": _clean_string(info.get("sector")),
        "industry": _clean_string(info.get("industry")),
        "long_name": _clean_string(info.get("longName")),
        "short_name": _clean_string(info.get("shortName")),
        "display_name": _clean_string(info.get("displayName")),
        "business_summary": _clean_string(info.get("longBusinessSummary")),
        "website": _clean_string(
            info.get("website") or info.get("websiteUrl") or info.get("website_url")
        ),
        "source": SOURCE_NAME,
        "raw_json": None,
        "ingested_at": ingested_at.isoformat(),
    }
    return row


def _safe_info(ticker_data: Any) -> dict[str, Any]:
    try:
        value = ticker_data.get_info() if hasattr(ticker_data, "get_info") else ticker_data.info
    except Exception as exc:
        LOGGER.debug("Unable to read yfinance info: %s", exc)
        return {}

    return value if isinstance(value, dict) else {}


def _safe_statement(ticker_data: Any, *names: str) -> pd.DataFrame | None:
    for name in names:
        try:
            value = getattr(ticker_data, name, None)
            if callable(value):
                value = value()
            if isinstance(value, pd.DataFrame) and not value.empty:
                return value
        except Exception as exc:
            LOGGER.debug("Unable to read yfinance statement %s: %s", name, exc)

    return None


def _statement_value(statement: pd.DataFrame | None, label: str) -> float | None:
    if statement is None or label not in statement.index:
        return None

    row = statement.loc[label]
    if isinstance(row, pd.Series):
        values = row.dropna()
        return _clean_float(values.iloc[0]) if not values.empty else None

    return _clean_float(row)


def _latest_cached_rows(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        ticker = str(row.get("ticker", ""))
        as_of_date = _parse_optional_date(row.get("as_of_date"))
        if not ticker or as_of_date is None:
            continue
        current_date = _parse_optional_date(latest.get(ticker, {}).get("as_of_date"))
        if current_date is None or as_of_date > current_date:
            latest[ticker] = row
    return latest


def _is_cache_fresh(cached_date: date | None, as_of_date: date, freshness_days: int) -> bool:
    if cached_date is None:
        return False
    return cached_date >= as_of_date - timedelta(days=freshness_days)


def _has_business_summary(row: dict[str, Any] | None) -> bool:
    if row is None:
        return False
    return _clean_string(row.get("business_summary")) is not None


def _parse_optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _has_any_fundamental_value(row: dict[str, Any]) -> bool:
    ignored_keys = {"ticker", "as_of_date", "source", "raw_json", "ingested_at"}
    return any(row.get(key) is not None for key in row if key not in ignored_keys)


def _first_clean_float(*values: object) -> float | None:
    for value in values:
        cleaned = _clean_float(value)
        if cleaned is not None:
            return cleaned
    return None


def _clean_float(value: object) -> float | None:
    if _is_missing(value):
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _clean_string(value: object) -> str | None:
    if _is_missing(value):
        return None
    text = str(value).strip()
    return text or None


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    try:
        missing = pd.isna(value)
    except (TypeError, ValueError):
        return False
    return missing if isinstance(missing, bool) else False
