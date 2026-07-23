from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from dataclasses import dataclass
from itertools import islice
from typing import Any

from pipeline.config import Settings, load_settings

LOGGER = logging.getLogger(__name__)

PRICE_READ_COLUMNS = "ticker,date,open,high,low,close,volume"
FUNDAMENTAL_READ_COLUMNS = ",".join(
    (
        "ticker",
        "as_of_date",
        "market_cap",
        "trailing_pe",
        "forward_pe",
        "price_to_book",
        "price_to_sales",
        "revenue_ttm",
        "revenue_growth",
        "net_income_ttm",
        "profit_margin",
        "operating_margin",
        "free_cash_flow",
        "total_debt",
        "debt_to_equity",
        "current_ratio",
        "sector",
        "industry",
        "long_name",
        "short_name",
        "display_name",
        "business_summary",
        "website",
    )
)
PREDICTION_READ_COLUMNS = ",".join(
    (
        "prediction_id",
        "ticker",
        "prediction_date",
        "target_date",
        "prediction_horizon",
        "model_name",
        "model_slug",
        "reference_close",
        "predicted_return",
        "predicted_close",
        "predicted_close_lower",
        "predicted_close_upper",
        "interval_level",
        "reasoning_summary",
        "model_metadata",
    )
)
PREDICTION_SCORE_READ_COLUMNS = ",".join(
    (
        "prediction_id",
        "actual_close",
        "actual_return",
        "absolute_error",
        "squared_error",
        "absolute_pct_error",
        "direction_correct",
        "winkler_score",
        "scored_at",
    )
)
USER_PROFILE_READ_COLUMNS = ",".join(
    (
        "user_id",
        "username",
        "display_username",
        "is_public",
        "avatar_style",
        "avatar_seed",
        "avatar_options",
    )
)
USER_PREDICTION_READ_COLUMNS = ",".join(
    (
        "prediction_id",
        "user_id",
        "ticker",
        "prediction_date",
        "target_date",
        "prediction_horizon",
        "reference_close",
        "predicted_close",
        "predicted_return",
        "status",
    )
)
USER_PREDICTION_SCORE_READ_COLUMNS = ",".join(
    (
        "prediction_id",
        "user_id",
        "ticker",
        "target_date",
        "prediction_horizon",
        "absolute_error",
        "squared_error",
        "absolute_pct_error",
        "direction_correct",
        "scored_at",
    )
)


@dataclass(frozen=True)
class DatabaseConfig:
    url: str
    has_secret_key: bool


@dataclass
class DatabaseReadMetrics:
    resource: str
    requests: int = 0
    rows: int = 0
    approximate_json_bytes: int = 0

    def record(self, rows: list[dict[str, Any]]) -> None:
        self.requests += 1
        self.rows += len(rows)
        self.approximate_json_bytes += len(
            json.dumps(
                rows,
                default=str,
                ensure_ascii=False,
                separators=(",", ":"),
            ).encode("utf-8")
        )

    def log(self) -> None:
        LOGGER.info(
            "Supabase read resource=%s requests=%s rows=%s approximate_json_bytes=%s",
            self.resource,
            self.requests,
            self.rows,
            self.approximate_json_bytes,
        )


def get_database_config(settings: Settings | None = None) -> DatabaseConfig | None:
    settings = settings or load_settings()
    if not settings.supabase_url:
        return None
    return DatabaseConfig(
        url=settings.supabase_url,
        has_secret_key=bool(settings.supabase_secret_key),
    )


def _chunks(rows: list[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    iterator = iter(rows)
    while batch := list(islice(iterator, size)):
        yield batch


class SupabaseDatabase:
    def __init__(self, url: str, secret_key: str) -> None:
        from supabase import create_client

        self._client = create_client(url, secret_key)

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> SupabaseDatabase | None:
        settings = settings or load_settings()
        if not settings.supabase_url or not settings.supabase_secret_key:
            LOGGER.warning(
                "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY "
                "to write pipeline data."
            )
            return None
        return cls(settings.supabase_url, settings.supabase_secret_key)

    def upsert_prices(self, rows: list[dict[str, Any]], batch_size: int = 500) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("prices").upsert(batch, on_conflict="ticker,date").execute()
            written += len(batch)

        return written

    def fetch_prices(
        self,
        batch_size: int = 1000,
        start_date: str | None = None,
        end_date: str | None = None,
        tickers: tuple[str, ...] | None = None,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("prices")
        start = 0

        while True:
            end = start + batch_size - 1
            query = (
                self._client.table("prices")
                .select(PRICE_READ_COLUMNS)
                .order("ticker")
                .order("date")
            )
            if start_date is not None:
                query = query.gte("date", start_date)
            if end_date is not None:
                query = query.lte("date", end_date)
            if tickers is not None:
                query = query.in_("ticker", list(tickers))

            response = query.range(start, end).execute()
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def fetch_latest_price_dates(self, tickers: tuple[str, ...]) -> dict[str, str]:
        if not tickers:
            return {}

        response = self._client.rpc(
            "get_latest_price_dates",
            {"p_tickers": list(tickers)},
        ).execute()
        rows = response.data or []
        metrics = DatabaseReadMetrics("get_latest_price_dates")
        metrics.record(rows)
        metrics.log()
        latest_dates: dict[str, str] = {}
        for row in rows:
            ticker = row.get("ticker")
            price_date = row.get("date")
            if ticker is not None and price_date is not None:
                latest_dates[str(ticker)] = str(price_date)

        return latest_dates

    def upsert_live_price_snapshots(
        self,
        rows: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("live_price_snapshots").upsert(
                batch,
                on_conflict="ticker",
            ).execute()
            written += len(batch)

        return written

    def upsert_intraday_price_bars(
        self,
        rows: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("intraday_price_bars").upsert(
                batch,
                on_conflict="ticker,ts",
            ).execute()
            written += len(batch)

        return written

    def delete_intraday_price_bars_before(self, cutoff_ts: str) -> int:
        self._client.table("intraday_price_bars").delete().lt("ts", cutoff_ts).execute()
        return 0

    def insert_live_price_fetch_event(self, row: dict[str, Any]) -> int:
        self._client.table("live_price_fetch_events").insert(row).execute()
        return 1

    def fetch_live_price_snapshots(
        self,
        tickers: tuple[str, ...] | None = None,
        batch_size: int = 1000,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("live_price_snapshots")
        start = 0

        while True:
            end = start + batch_size - 1
            query = self._client.table("live_price_snapshots").select("*").order("ticker")
            if tickers is not None:
                query = query.in_("ticker", list(tickers))

            response = query.range(start, end).execute()
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def upsert_features(self, rows: list[dict[str, Any]], batch_size: int = 500) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("features").upsert(batch, on_conflict="ticker,date").execute()
            written += len(batch)

        return written

    def fetch_features(
        self,
        batch_size: int = 1000,
        start_date: str | None = None,
        end_date: str | None = None,
        tickers: tuple[str, ...] | None = None,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("features")
        start = 0

        while True:
            end = start + batch_size - 1
            query = self._client.table("features").select("*").order("ticker").order("date")
            if start_date is not None:
                query = query.gte("date", start_date)
            if end_date is not None:
                query = query.lte("date", end_date)
            if tickers is not None:
                query = query.in_("ticker", list(tickers))

            response = query.range(start, end).execute()
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def fetch_latest_feature_dates(self, tickers: tuple[str, ...]) -> dict[str, str]:
        latest_dates: dict[str, str] = {}
        metrics = DatabaseReadMetrics("latest_feature_dates")
        for ticker in tickers:
            response = (
                self._client.table("features")
                .select("ticker,date")
                .eq("ticker", ticker)
                .order("date", desc=True)
                .limit(1)
                .execute()
            )
            rows = response.data or []
            metrics.record(rows)
            if rows and rows[0].get("date") is not None:
                latest_dates[ticker] = str(rows[0]["date"])

        metrics.log()
        return latest_dates

    def upsert_fundamentals(self, rows: list[dict[str, Any]], batch_size: int = 500) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("fundamentals").upsert(
                batch,
                on_conflict="ticker,as_of_date",
            ).execute()
            written += len(batch)

        self._delete_older_fundamentals(rows)
        return written

    def _delete_older_fundamentals(self, rows: list[dict[str, Any]]) -> None:
        latest_dates: dict[str, str] = {}
        for row in rows:
            ticker = str(row.get("ticker", ""))
            as_of_date = row.get("as_of_date")
            if not ticker or as_of_date is None:
                continue
            date_text = str(as_of_date)
            current = latest_dates.get(ticker)
            if current is None or date_text > current:
                latest_dates[ticker] = date_text

        for ticker, as_of_date in latest_dates.items():
            (
                self._client.table("fundamentals")
                .delete()
                .eq("ticker", ticker)
                .lt("as_of_date", as_of_date)
                .execute()
            )

    def fetch_latest_fundamentals(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("fundamentals")
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("fundamentals")
                .select(FUNDAMENTAL_READ_COLUMNS)
                .order("ticker")
                .order("as_of_date", desc=True)
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return _latest_fundamentals_by_ticker(rows)

            start += batch_size

    def upsert_ticker_assets(self, rows: list[dict[str, Any]], batch_size: int = 100) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("ticker_assets").upsert(
                batch,
                on_conflict="ticker",
            ).execute()
            written += len(batch)

        return written

    def fetch_ticker_assets(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("ticker_assets")
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("ticker_assets")
                .select("*")
                .order("ticker")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def upsert_predictions(self, rows: list[dict[str, Any]], batch_size: int = 500) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("predictions").upsert(
                batch,
                on_conflict="ticker,prediction_date,target_date,prediction_horizon,model_slug",
            ).execute()
            written += len(batch)

        return written

    def fetch_predictions(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("predictions")
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("predictions")
                .select(PREDICTION_READ_COLUMNS)
                .order("ticker")
                .order("target_date")
                .order("prediction_id")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def upsert_prediction_scores(
        self,
        rows: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        if not rows:
            return 0

        table_columns = {
            "prediction_id",
            "ticker",
            "prediction_date",
            "target_date",
            "prediction_horizon",
            "model_name",
            "model_slug",
            "actual_close",
            "actual_return",
            "absolute_error",
            "squared_error",
            "absolute_pct_error",
            "predicted_direction",
            "actual_direction",
            "direction_correct",
            "interval_hit",
            "interval_width",
            "interval_width_pct",
            "interval_miss_distance",
            "winkler_score",
            "scored_at",
        }
        written = 0
        for batch in _chunks(rows, batch_size):
            cleaned_batch = [
                {key: value for key, value in row.items() if key in table_columns} for row in batch
            ]
            self._client.table("prediction_scores").upsert(
                cleaned_batch,
                on_conflict="prediction_id",
            ).execute()
            written += len(cleaned_batch)

        return written

    def fetch_prediction_scores(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("prediction_scores")
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("prediction_scores")
                .select(PREDICTION_SCORE_READ_COLUMNS)
                .order("scored_at")
                .order("prediction_id")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def fetch_user_profiles(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("user_profiles")
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("user_profiles")
                .select(USER_PROFILE_READ_COLUMNS)
                .order("display_username")
                .order("user_id")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def fetch_user_predictions(
        self,
        status: str | None = None,
        batch_size: int = 1000,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("user_predictions")
        start = 0

        while True:
            end = start + batch_size - 1
            query = (
                self._client.table("user_predictions")
                .select(USER_PREDICTION_READ_COLUMNS)
                .order("ticker")
                .order("target_date")
                .order("prediction_id")
            )
            if status is not None:
                query = query.eq("status", status)

            response = query.range(start, end).execute()
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def upsert_user_prediction_scores(
        self,
        rows: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        if not rows:
            return 0

        table_columns = {
            "prediction_id",
            "user_id",
            "ticker",
            "prediction_date",
            "target_date",
            "prediction_horizon",
            "actual_close",
            "actual_return",
            "absolute_error",
            "squared_error",
            "absolute_pct_error",
            "predicted_direction",
            "actual_direction",
            "direction_correct",
            "score_verdict",
            "score_verdict_rank",
            "score_verdict_color",
            "xp_awarded",
            "scored_at",
        }
        written = 0
        for batch in _chunks(rows, batch_size):
            cleaned_batch = [
                {key: value for key, value in row.items() if key in table_columns} for row in batch
            ]
            self._client.table("user_prediction_scores").upsert(
                cleaned_batch,
                on_conflict="prediction_id",
            ).execute()
            written += len(cleaned_batch)

        return written

    def grant_scored_prediction_rewards(self, prediction_ids: list[str]) -> int:
        if not prediction_ids:
            return 0

        granted = 0
        for prediction_id in prediction_ids:
            response = self._client.rpc(
                "grant_scored_prediction_reward",
                {"p_prediction_id": prediction_id},
            ).execute()
            if response.data:
                granted += 1

        return granted

    def refresh_public_user_profiles(self) -> int:
        response = self._client.rpc("refresh_public_user_profiles", {}).execute()
        return int(response.data or 0)

    def refresh_competitive_depth(self) -> dict[str, Any]:
        response = self._client.rpc("refresh_competitive_depth", {}).execute()
        data = response.data or {}
        return data if isinstance(data, dict) else {}

    def snapshot_user_leaderboard_ranks(self) -> int:
        response = self._client.rpc("snapshot_user_leaderboard_ranks", {}).execute()
        return int(response.data or 0)

    def refresh_user_leaderboard_movement(self) -> int:
        response = self._client.rpc("refresh_user_leaderboard_movement", {}).execute()
        return int(response.data or 0)

    def evaluate_public_competition_badges(self) -> int:
        response = self._client.rpc("evaluate_public_competition_badges", {}).execute()
        return int(response.data or 0)

    def prune_user_engagement_events(self, seen_before: str | None = None) -> int:
        params = {}
        if seen_before is not None:
            params["p_seen_before"] = seen_before
        response = self._client.rpc("prune_user_engagement_events", params).execute()
        return int(response.data or 0)

    def refresh_nearby_rivals(self) -> int:
        response = self._client.rpc("refresh_nearby_rivals", {}).execute()
        return int(response.data or 0)

    def refresh_user_ticker_specialties(self) -> int:
        response = self._client.rpc("refresh_user_ticker_specialties", {}).execute()
        return int(response.data or 0)

    def fetch_user_prediction_scores(
        self,
        batch_size: int = 1000,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        metrics = DatabaseReadMetrics("user_prediction_scores")
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("user_prediction_scores")
                .select(USER_PREDICTION_SCORE_READ_COLUMNS)
                .order("scored_at")
                .order("prediction_id")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            metrics.record(batch)
            rows.extend(batch)

            if len(batch) < batch_size:
                metrics.log()
                return rows

            start += batch_size

    def mark_user_predictions_scored(self, prediction_ids: list[str]) -> int:
        if not prediction_ids:
            return 0

        self._client.table("user_predictions").update({"status": "scored"}).in_(
            "prediction_id",
            prediction_ids,
        ).execute()
        return len(prediction_ids)

    def replace_dashboard_table(
        self,
        table_name: str,
        rows: list[dict[str, Any]],
        batch_size: int = 500,
    ) -> int:
        self._client.table(table_name).delete().neq(
            "generated_at",
            "0001-01-01T00:00:00+00:00",
        ).execute()

        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table(table_name).insert(batch).execute()
            written += len(batch)

        return written


def _latest_fundamentals_by_ticker(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for row in rows:
        ticker = str(row.get("ticker", ""))
        if not ticker or ticker in latest:
            continue
        latest[ticker] = row
    return list(latest.values())
