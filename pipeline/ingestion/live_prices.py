from __future__ import annotations

import logging
import math
import time
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from datetime import time as datetime_time
from itertools import islice
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd

from pipeline.ingestion.ticker_universe import MVP_TICKERS, to_yfinance_symbol

LOGGER = logging.getLogger(__name__)
SOURCE_NAME = "yfinance"
MARKET_TIMEZONE = ZoneInfo("America/New_York")
LIVE_STALE_SECONDS = 75
CLOSED_STALE_MINUTES = 15


@dataclass(frozen=True)
class LivePriceResult:
    snapshots: list[dict[str, Any]]
    bars: list[dict[str, Any]]
    failed_tickers: list[str]
    skipped_tickers: list[str] = field(default_factory=list)


def fetch_live_prices(
    tickers: tuple[str, ...] = MVP_TICKERS,
    *,
    period: str = "1d",
    interval: str = "1m",
    batch_size: int = 50,
    max_attempts: int = 3,
    now: datetime | None = None,
) -> LivePriceResult:
    """Fetch current-ish quotes and current-session minute bars.

    This is intentionally separate from daily OHLCV ingestion. It writes narrow,
    short-lived quote/bar data for UI freshness only; model scoring continues to
    use the daily `prices` table.
    """

    fetched_at = _utc_now(now)
    snapshots: list[dict[str, Any]] = []
    bars: list[dict[str, Any]] = []
    failed_tickers: list[str] = []
    skipped_tickers: list[str] = []

    normalized_tickers = tuple(
        dict.fromkeys(ticker.strip().upper() for ticker in tickers if ticker.strip())
    )
    LOGGER.info(
        "Fetching live %s bars for %s tickers in batches of %s.",
        interval,
        len(normalized_tickers),
        batch_size,
    )

    for ticker_batch in _chunks(normalized_tickers, batch_size):
        frame = _download_batch_with_retries(
            ticker_batch,
            period=period,
            interval=interval,
            max_attempts=max_attempts,
        )
        if frame is None or frame.empty:
            failed_tickers.extend(ticker_batch)
            continue

        for ticker in ticker_batch:
            ticker_frame = _extract_ticker_frame(frame, ticker, len(ticker_batch))
            if ticker_frame is None or ticker_frame.empty:
                failed_tickers.append(ticker)
                LOGGER.warning("No live price frame returned for %s.", ticker)
                continue

            ticker_bars = _frame_to_intraday_bar_rows(
                ticker=ticker,
                frame=ticker_frame,
                fetched_at=fetched_at,
            )
            if not ticker_bars:
                skipped_tickers.append(ticker)
                LOGGER.warning("No complete live price bars returned for %s.", ticker)
                continue

            bars.extend(ticker_bars)
            snapshots.append(
                _build_live_snapshot_row(
                    ticker=ticker,
                    bars=ticker_bars,
                    fetched_at=fetched_at,
                    period=period,
                    interval=interval,
                )
            )

    return LivePriceResult(
        snapshots=snapshots,
        bars=bars,
        failed_tickers=failed_tickers,
        skipped_tickers=skipped_tickers,
    )


def current_intraday_retention_cutoff(now: datetime | None = None) -> str:
    """Return current ET midnight as UTC ISO for current-day-only retention."""

    current = _utc_now(now).astimezone(MARKET_TIMEZONE)
    cutoff = datetime.combine(current.date(), datetime_time.min, tzinfo=MARKET_TIMEZONE)
    return cutoff.astimezone(UTC).isoformat()


def is_regular_market_hours(now: datetime | None = None) -> bool:
    return _market_state_at(_utc_now(now)) == "regular"


def _download_batch_with_retries(
    tickers: tuple[str, ...],
    *,
    period: str,
    interval: str,
    max_attempts: int,
) -> pd.DataFrame | None:
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return _download_yfinance_batch(tickers, period=period, interval=interval)
        except Exception as exc:
            last_error = exc
            LOGGER.warning(
                "Live price fetch attempt %s/%s failed for %s: %s",
                attempt,
                max_attempts,
                tickers,
                exc,
            )
            if attempt < max_attempts:
                time.sleep(0.75 * attempt)

    LOGGER.error("Giving up on live price batch %s: %s", tickers, last_error)
    return None


def _download_yfinance_batch(
    tickers: tuple[str, ...],
    *,
    period: str,
    interval: str,
) -> pd.DataFrame:
    import yfinance as yf

    provider_symbols = [to_yfinance_symbol(ticker) for ticker in tickers]
    return yf.download(
        " ".join(provider_symbols),
        period=period,
        interval=interval,
        auto_adjust=True,
        actions=False,
        progress=False,
        threads=True,
        group_by="ticker",
    )


def _extract_ticker_frame(
    frame: pd.DataFrame,
    ticker: str,
    ticker_count: int,
) -> pd.DataFrame | None:
    provider_symbol = to_yfinance_symbol(ticker)
    if not isinstance(frame.columns, pd.MultiIndex):
        return frame if ticker_count == 1 else None

    for level in range(frame.columns.nlevels):
        level_values = {str(value) for value in frame.columns.get_level_values(level)}
        if provider_symbol in level_values:
            ticker_frame = frame.xs(provider_symbol, axis=1, level=level)
            if isinstance(ticker_frame, pd.Series):
                ticker_frame = ticker_frame.to_frame().T
            return _flatten_remaining_columns(ticker_frame)

    return None


def _flatten_remaining_columns(frame: pd.DataFrame) -> pd.DataFrame:
    if not isinstance(frame.columns, pd.MultiIndex):
        return frame

    price_columns = {"Open", "High", "Low", "Close", "Volume"}
    flattened = frame.copy()
    flattened.columns = [
        next((str(part) for part in column if str(part) in price_columns), str(column[-1]))
        for column in flattened.columns
    ]
    return flattened


def _frame_to_intraday_bar_rows(
    *,
    ticker: str,
    frame: pd.DataFrame,
    fetched_at: datetime,
) -> list[dict[str, Any]]:
    required_columns = {"Close"}
    missing_columns = required_columns - set(frame.columns)
    if missing_columns:
        raise ValueError(f"{ticker} is missing live price columns: {sorted(missing_columns)}")

    rows: list[dict[str, Any]] = []
    for index, values in frame.iterrows():
        close_price = _clean_float(values.get("Close"))
        if close_price is None:
            continue

        rows.append(
            {
                "ticker": ticker,
                "ts": _timestamp_to_utc_iso(index),
                "provider": SOURCE_NAME,
                "provider_symbol": to_yfinance_symbol(ticker),
                "open": _clean_float(values.get("Open")),
                "high": _clean_float(values.get("High")),
                "low": _clean_float(values.get("Low")),
                "close": close_price,
                "volume": _clean_int(values.get("Volume")),
                "fetched_at": fetched_at.isoformat(),
            }
        )

    return rows


def _build_live_snapshot_row(
    *,
    ticker: str,
    bars: list[dict[str, Any]],
    fetched_at: datetime,
    period: str,
    interval: str,
) -> dict[str, Any]:
    latest = max(bars, key=lambda row: str(row["ts"]))
    market_state = _snapshot_market_state(fetched_at, str(latest["ts"]))
    day_open = next((row["open"] for row in bars if row.get("open") is not None), None)
    highs = [float(row["high"]) for row in bars if row.get("high") is not None]
    lows = [float(row["low"]) for row in bars if row.get("low") is not None]
    volumes = [int(row["volume"]) for row in bars if row.get("volume") is not None]
    stale_after = _stale_after(fetched_at, market_state)

    return {
        "ticker": ticker,
        "provider": SOURCE_NAME,
        "provider_symbol": to_yfinance_symbol(ticker),
        "currency": "USD",
        "market_state": market_state,
        "price": latest["close"],
        "previous_close": None,
        "day_open": day_open,
        "day_high": max(highs) if highs else None,
        "day_low": min(lows) if lows else None,
        "day_volume": sum(volumes) if volumes else None,
        "change": None,
        "change_percent": None,
        "as_of": latest["ts"],
        "fetched_at": fetched_at.isoformat(),
        "stale_after": stale_after.isoformat(),
        "provider_metadata": {
            "period": period,
            "interval": interval,
            "bar_count": len(bars),
            "timestamp_inferred": False,
        },
    }


def _market_state_at(value: datetime) -> str:
    local = value.astimezone(MARKET_TIMEZONE)
    if local.weekday() >= 5:
        return "closed"

    current_time = local.time()
    if datetime_time(9, 30) <= current_time < datetime_time(16, 0):
        return "regular"
    if datetime_time(4, 0) <= current_time < datetime_time(9, 30):
        return "pre"
    if datetime_time(16, 0) <= current_time < datetime_time(20, 0):
        return "post"
    return "closed"


def _snapshot_market_state(fetched_at: datetime, latest_bar_ts: str) -> str:
    market_state = _market_state_at(fetched_at)
    if market_state != "regular":
        return market_state

    try:
        latest_bar_date = datetime.fromisoformat(latest_bar_ts).astimezone(MARKET_TIMEZONE).date()
    except ValueError:
        return "unknown"

    fetched_date = fetched_at.astimezone(MARKET_TIMEZONE).date()
    if latest_bar_date != fetched_date:
        LOGGER.warning(
            "Latest live bar timestamp %s is not from the current ET session date %s.",
            latest_bar_ts,
            fetched_date.isoformat(),
        )
        return "closed"

    return market_state


def _stale_after(fetched_at: datetime, market_state: str) -> datetime:
    if market_state == "regular":
        return fetched_at + timedelta(seconds=LIVE_STALE_SECONDS)
    return fetched_at + timedelta(minutes=CLOSED_STALE_MINUTES)


def _timestamp_to_utc_iso(value: object) -> str:
    timestamp = pd.Timestamp(value)
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize(MARKET_TIMEZONE)
    else:
        timestamp = timestamp.tz_convert(UTC)
    return timestamp.to_pydatetime().astimezone(UTC).isoformat()


def _utc_now(value: datetime | None = None) -> datetime:
    current = value or datetime.now(UTC)
    if current.tzinfo is None:
        return current.replace(tzinfo=UTC)
    return current.astimezone(UTC)


def _clean_float(value: object) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _clean_int(value: object) -> int | None:
    number = _clean_float(value)
    if number is None:
        return None
    return int(number)


def _chunks(values: Iterable[str], size: int) -> Iterable[tuple[str, ...]]:
    iterator = iter(values)
    while batch := tuple(islice(iterator, size)):
        yield batch
