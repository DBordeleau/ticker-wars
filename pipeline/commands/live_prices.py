from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from time import perf_counter
from typing import Any

from pipeline.commands.common import daily_prediction_tickers
from pipeline.db import SupabaseDatabase
from pipeline.ingestion.live_prices import (
    LivePriceResult,
    current_intraday_retention_cutoff,
    fetch_live_prices,
    is_regular_market_hours,
)

LOGGER = logging.getLogger(__name__)


def run_refresh_live_prices(
    *,
    tickers: tuple[str, ...] | None = None,
    dry_run: bool = False,
    batch_size: int = 50,
    regular_hours_only: bool = False,
) -> int:
    if regular_hours_only and not is_regular_market_hours():
        LOGGER.info("Live price refresh skipped because regular market hours are not active.")
        return 0

    target_tickers = tickers or daily_prediction_tickers()
    started_at = datetime.now(UTC)
    timer_started_at = perf_counter()
    result = fetch_live_prices(tickers=target_tickers, batch_size=batch_size)
    finished_at = datetime.now(UTC)
    duration_ms = int((perf_counter() - timer_started_at) * 1000)

    LOGGER.info(
        "Live price refresh fetched %s snapshots and %s intraday bars.",
        len(result.snapshots),
        len(result.bars),
    )
    if result.failed_tickers:
        LOGGER.warning(
            "Live price refresh failed for %s tickers: %s",
            len(result.failed_tickers),
            result.failed_tickers,
        )
    if result.skipped_tickers:
        LOGGER.info(
            "Live price refresh skipped %s tickers with incomplete live bars: %s",
            len(result.skipped_tickers),
            result.skipped_tickers,
        )
    regular_snapshots = [row for row in result.snapshots if row.get("market_state") == "regular"]
    if regular_hours_only and not regular_snapshots:
        LOGGER.warning(
            "Live price refresh ran during regular hours, but no regular-session "
            "snapshots were produced."
        )
    exit_code = 1 if regular_hours_only and not regular_snapshots else 0

    if dry_run:
        LOGGER.info("Live price refresh dry run complete; no Supabase writes performed.")
        return exit_code

    database = SupabaseDatabase.from_settings()
    if database is None:
        LOGGER.info("Live price refresh skipped writes because Supabase is not configured.")
        return exit_code

    snapshot_count = database.upsert_live_price_snapshots(result.snapshots)
    bar_count = database.upsert_intraday_price_bars(result.bars)
    cutoff = current_intraday_retention_cutoff()
    database.delete_intraday_price_bars_before(cutoff)
    event_count = database.insert_live_price_fetch_event(
        build_live_price_fetch_event(
            requested_tickers=target_tickers,
            result=result,
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            error_message=(
                "Regular-hours refresh produced no regular-session snapshots."
                if exit_code
                else None
            ),
        )
    )

    LOGGER.info(
        "Live price refresh wrote %s snapshots, %s intraday bars, and %s fetch event. "
        "Pruned bars before %s.",
        snapshot_count,
        bar_count,
        event_count,
        cutoff,
    )
    return exit_code


def run_check_live_prices(
    *,
    tickers: tuple[str, ...] | None = None,
    max_stale_minutes: int = 5,
    regular_hours_only: bool = False,
) -> int:
    if regular_hours_only and not is_regular_market_hours():
        LOGGER.info("Live price health check skipped because regular market hours are not active.")
        return 0

    database = SupabaseDatabase.from_settings()
    if database is None:
        LOGGER.info("Live price health check skipped because Supabase is not configured.")
        return 0

    target_tickers = tickers or daily_prediction_tickers()
    snapshots = database.fetch_live_price_snapshots(target_tickers)
    return report_live_price_health(
        snapshots,
        expected_tickers=target_tickers,
        max_stale_minutes=max_stale_minutes,
        require_regular=regular_hours_only,
    )


def build_live_price_fetch_event(
    *,
    requested_tickers: tuple[str, ...],
    result: LivePriceResult,
    started_at: datetime,
    finished_at: datetime,
    duration_ms: int,
    error_message: str | None = None,
) -> dict[str, Any]:
    succeeded_tickers = tuple(
        sorted({str(row["ticker"]) for row in result.snapshots if row.get("ticker")})
    )
    failed_tickers = tuple(sorted({*result.failed_tickers, *result.skipped_tickers}))
    return {
        "provider": "yfinance",
        "requested_tickers": list(requested_tickers),
        "succeeded_tickers": list(succeeded_tickers),
        "failed_tickers": list(failed_tickers),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "duration_ms": duration_ms,
        "error_message": error_message,
    }


def report_live_price_health(
    snapshots: list[dict[str, Any]],
    *,
    expected_tickers: tuple[str, ...],
    max_stale_minutes: int,
    require_regular: bool,
    now: datetime | None = None,
) -> int:
    current = utc_now(now)
    expected = set(expected_tickers)
    present = {str(row.get("ticker")) for row in snapshots if row.get("ticker")}
    missing_tickers = sorted(expected - present)
    stale_cutoff = current - timedelta(minutes=max_stale_minutes)
    fresh_rows = [
        row
        for row in snapshots
        if parse_timestamp(row.get("as_of")) >= stale_cutoff
        and parse_timestamp(row.get("stale_after")) >= current
    ]
    regular_rows = [row for row in fresh_rows if row.get("market_state") == "regular"]
    stale_rows = [row for row in snapshots if row not in fresh_rows]
    newest_as_of = max((parse_timestamp(row.get("as_of")) for row in snapshots), default=None)
    oldest_as_of = min((parse_timestamp(row.get("as_of")) for row in snapshots), default=None)

    LOGGER.info(
        "Live price health: %s snapshots, %s fresh, %s regular, %s stale, %s missing.",
        len(snapshots),
        len(fresh_rows),
        len(regular_rows),
        len(stale_rows),
        len(missing_tickers),
    )
    if newest_as_of is not None and oldest_as_of is not None:
        LOGGER.info(
            "Live price as_of range: oldest=%s newest=%s.",
            oldest_as_of.isoformat(),
            newest_as_of.isoformat(),
        )
    if missing_tickers:
        LOGGER.warning("Live price snapshots missing for: %s", missing_tickers[:25])
    if stale_rows:
        stale_tickers = sorted(str(row.get("ticker")) for row in stale_rows if row.get("ticker"))
        LOGGER.warning("Live price snapshots stale for: %s", stale_tickers[:25])

    if missing_tickers:
        return 1
    if require_regular and not regular_rows:
        LOGGER.error("Live price health failed: no fresh regular-session snapshots found.")
        return 1
    if snapshots and not fresh_rows:
        LOGGER.error("Live price health failed: no fresh snapshots found.")
        return 1
    if not snapshots:
        LOGGER.error("Live price health failed: no snapshots found.")
        return 1
    return 0


def parse_timestamp(value: object) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        return datetime.min.replace(tzinfo=UTC)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def utc_now(value: datetime | None = None) -> datetime:
    current = value or datetime.now(UTC)
    if current.tzinfo is None:
        return current.replace(tzinfo=UTC)
    return current.astimezone(UTC)
