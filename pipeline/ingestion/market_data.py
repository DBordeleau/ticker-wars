from __future__ import annotations

import logging
import math
import time
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pandas as pd

from pipeline.ingestion.ticker_universe import MVP_TICKERS, to_yfinance_symbol

LOGGER = logging.getLogger(__name__)
SOURCE_NAME = "yfinance"
DEFAULT_DAILY_DOWNLOAD_BATCH_SIZE = 50


@dataclass(frozen=True)
class MarketDataResult:
    rows: list[dict[str, Any]]
    failed_tickers: list[str]
    skipped_tickers: list[str] = field(default_factory=list)


def fetch_daily_prices(
    start_date: str,
    tickers: tuple[str, ...] = MVP_TICKERS,
    end_date: str | None = None,
    max_attempts: int = 3,
    batch_size: int = DEFAULT_DAILY_DOWNLOAD_BATCH_SIZE,
) -> MarketDataResult:
    rows: list[dict[str, Any]] = []
    failed_tickers: list[str] = []

    LOGGER.info("Fetching daily prices for %s tickers from %s", len(tickers), start_date)
    for batch in _ticker_batches(tickers, batch_size):
        batch_rows, batch_failures = _fetch_batch_with_missing_fallback(
            batch,
            start_date,
            end_date,
            max_attempts,
        )
        rows.extend(batch_rows)
        failed_tickers.extend(batch_failures)

    return MarketDataResult(rows=rows, failed_tickers=failed_tickers)


def fetch_incremental_daily_prices(
    start_date: str,
    latest_dates: dict[str, str],
    tickers: tuple[str, ...] = MVP_TICKERS,
    end_date: str | None = None,
    max_attempts: int = 3,
    batch_size: int = DEFAULT_DAILY_DOWNLOAD_BATCH_SIZE,
) -> MarketDataResult:
    base_start = _parse_date(start_date)
    rows: list[dict[str, Any]] = []
    failed_tickers: list[str] = []
    skipped_tickers: list[str] = []
    grouped_tickers: dict[str, list[str]] = {}

    LOGGER.info("Fetching incremental daily prices for %s tickers.", len(tickers))
    for ticker in tickers:
        latest_date = _parse_optional_date(latest_dates.get(ticker))
        ticker_start = max(base_start, latest_date) if latest_date else base_start

        if end_date is not None and ticker_start >= _parse_date(end_date):
            skipped_tickers.append(ticker)
            LOGGER.info(
                "Skipping %s price fetch; latest stored date %s is at or beyond end date %s.",
                ticker,
                ticker_start.isoformat(),
                end_date,
            )
            continue

        grouped_tickers.setdefault(ticker_start.isoformat(), []).append(ticker)

    for ticker_start, grouped in sorted(grouped_tickers.items()):
        LOGGER.info(
            "Fetching %s tickers with incremental start date %s.",
            len(grouped),
            ticker_start,
        )
        for batch in _ticker_batches(tuple(grouped), batch_size):
            batch_rows, batch_failures = _fetch_batch_with_missing_fallback(
                batch,
                ticker_start,
                end_date,
                max_attempts,
                incremental=True,
            )
            rows.extend(batch_rows)
            failed_tickers.extend(batch_failures)

    return MarketDataResult(
        rows=rows,
        failed_tickers=failed_tickers,
        skipped_tickers=skipped_tickers,
    )


def _fetch_batch_with_missing_fallback(
    tickers: tuple[str, ...],
    start_date: str,
    end_date: str | None,
    max_attempts: int,
    *,
    incremental: bool = False,
) -> tuple[list[dict[str, Any]], list[str]]:
    rows_by_ticker = _fetch_tickers_with_retries(tickers, start_date, end_date, max_attempts)
    rows: list[dict[str, Any]] = []
    failed_tickers: list[str] = []

    for ticker in tickers:
        ticker_rows = rows_by_ticker.get(ticker, [])
        if ticker_rows:
            rows.extend(ticker_rows)
            LOGGER.info(
                "Fetched %s%s rows for %s%s.",
                len(ticker_rows),
                " incremental" if incremental else "",
                ticker,
                f" from {start_date}" if incremental else "",
            )
            continue

        fallback_rows = _fetch_ticker_with_retries(ticker, start_date, end_date, max_attempts)
        if fallback_rows:
            rows.extend(fallback_rows)
            LOGGER.info(
                "Fetched %s%s rows for %s with per-ticker fallback.",
                len(fallback_rows),
                " incremental" if incremental else "",
                ticker,
            )
        else:
            failed_tickers.append(ticker)
            LOGGER.warning(
                "No%s price rows fetched for %s",
                " incremental" if incremental else "",
                ticker,
            )

    return rows, failed_tickers


def _fetch_tickers_with_retries(
    tickers: tuple[str, ...],
    start_date: str,
    end_date: str | None,
    max_attempts: int,
) -> dict[str, list[dict[str, Any]]]:
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return _fetch_tickers(tickers, start_date, end_date)
        except Exception as exc:
            last_error = exc
            LOGGER.warning(
                "Fetch attempt %s/%s failed for %s tickers: %s",
                attempt,
                max_attempts,
                len(tickers),
                exc,
            )
            if attempt < max_attempts:
                time.sleep(0.75 * attempt)

    LOGGER.error(
        "Giving up on batch of %s tickers after %s attempts: %s",
        len(tickers),
        max_attempts,
        last_error,
    )
    return {ticker: [] for ticker in tickers}


def _fetch_ticker_with_retries(
    ticker: str,
    start_date: str,
    end_date: str | None,
    max_attempts: int,
) -> list[dict[str, Any]]:
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return _fetch_ticker(ticker, start_date, end_date)
        except Exception as exc:
            last_error = exc
            LOGGER.warning(
                "Fetch attempt %s/%s failed for %s: %s",
                attempt,
                max_attempts,
                ticker,
                exc,
            )
            if attempt < max_attempts:
                time.sleep(0.75 * attempt)

    LOGGER.error("Giving up on %s after %s attempts: %s", ticker, max_attempts, last_error)
    return []


def _fetch_tickers(
    tickers: tuple[str, ...],
    start_date: str,
    end_date: str | None,
) -> dict[str, list[dict[str, Any]]]:
    import yfinance as yf

    if not tickers:
        return {}

    provider_symbols = tuple(to_yfinance_symbol(ticker) for ticker in tickers)
    provider_to_ticker = dict(zip(provider_symbols, tickers, strict=True))
    download_end = end_date or (date.today() + timedelta(days=1)).isoformat()
    frame = yf.download(
        list(provider_symbols) if len(provider_symbols) > 1 else provider_symbols[0],
        start=start_date,
        end=download_end,
        auto_adjust=True,
        actions=False,
        progress=False,
        threads=False,
        group_by="ticker",
    )

    if frame.empty:
        return {ticker: [] for ticker in tickers}

    rows_by_ticker: dict[str, list[dict[str, Any]]] = {}
    for provider_symbol, ticker in provider_to_ticker.items():
        ticker_frame = _extract_ticker_frame(frame, provider_symbol)
        rows_by_ticker[ticker] = (
            [] if ticker_frame.empty else _frame_to_price_rows(ticker, ticker_frame)
        )

    return rows_by_ticker


def _fetch_ticker(ticker: str, start_date: str, end_date: str | None) -> list[dict[str, Any]]:
    return _fetch_tickers((ticker,), start_date, end_date).get(ticker, [])


def _extract_ticker_frame(frame: pd.DataFrame, provider_symbol: str) -> pd.DataFrame:
    if not isinstance(frame.columns, pd.MultiIndex):
        return _flatten_yfinance_columns(frame)

    for level in range(frame.columns.nlevels):
        values = {str(value) for value in frame.columns.get_level_values(level)}
        if provider_symbol in values:
            ticker_frame = frame.xs(provider_symbol, axis=1, level=level, drop_level=True)
            return _flatten_yfinance_columns(ticker_frame)

    return pd.DataFrame(index=frame.index)


def _flatten_yfinance_columns(frame: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(frame.columns, pd.MultiIndex):
        return frame

    price_columns = {"Open", "High", "Low", "Close", "Volume"}
    flattened = frame.copy()
    flattened.columns = [
        next(str(part) for part in column if str(part) in price_columns)
        for column in flattened.columns
    ]
    return flattened


def _frame_to_price_rows(ticker: str, frame: pd.DataFrame) -> list[dict[str, Any]]:
    required_columns = {"Open", "High", "Low", "Close", "Volume"}
    missing_columns = required_columns - set(frame.columns)
    if missing_columns:
        raise ValueError(f"{ticker} is missing columns: {sorted(missing_columns)}")

    ingested_at = datetime.now(UTC).isoformat()
    rows: list[dict[str, Any]] = []

    for index, values in frame.iterrows():
        open_price = _clean_float(values["Open"])
        high_price = _clean_float(values["High"])
        low_price = _clean_float(values["Low"])
        close_price = _clean_float(values["Close"])
        volume = _clean_int(values["Volume"])

        if None in {open_price, high_price, low_price, close_price} or volume is None:
            LOGGER.debug("Skipping incomplete %s price row for %s", ticker, index)
            continue

        rows.append(
            {
                "ticker": ticker,
                "date": pd.Timestamp(index).date().isoformat(),
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": close_price,
                "volume": volume,
                "source": SOURCE_NAME,
                "ingested_at": ingested_at,
            }
        )

    return rows


def _clean_float(value: object) -> float | None:
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _clean_int(value: object) -> int | None:
    number = _clean_float(value)
    if number is None:
        return None
    return int(number)


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def _parse_optional_date(value: object) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        return None


def _ticker_batches(tickers: tuple[str, ...], batch_size: int) -> list[tuple[str, ...]]:
    safe_batch_size = max(1, batch_size)
    return [
        tickers[index : index + safe_batch_size]
        for index in range(0, len(tickers), safe_batch_size)
    ]
