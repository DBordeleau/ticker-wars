from __future__ import annotations

import logging
from collections.abc import Iterator
from dataclasses import dataclass
from itertools import islice
from typing import Any

from pipeline.config import Settings, load_settings

LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class DatabaseConfig:
    url: str
    has_secret_key: bool


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

    def fetch_prices(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("prices")
                .select("*")
                .order("ticker")
                .order("date")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
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

    def fetch_features(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("features")
                .select("*")
                .order("ticker")
                .order("date")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
                return rows

            start += batch_size

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

        return written

    def fetch_latest_fundamentals(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("fundamentals")
                .select("*")
                .order("ticker")
                .order("as_of_date", desc=True)
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
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
            rows.extend(batch)

            if len(batch) < batch_size:
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
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("predictions")
                .select("*")
                .order("ticker")
                .order("target_date")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
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
                {key: value for key, value in row.items() if key in table_columns}
                for row in batch
            ]
            self._client.table("prediction_scores").upsert(
                cleaned_batch,
                on_conflict="prediction_id",
            ).execute()
            written += len(cleaned_batch)

        return written

    def fetch_prediction_scores(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("prediction_scores")
                .select("*")
                .order("scored_at")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
                return rows

            start += batch_size

    def fetch_user_profiles(self, batch_size: int = 1000) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("user_profiles")
                .select("*")
                .order("display_username")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
                return rows

            start += batch_size

    def fetch_user_predictions(
        self,
        status: str | None = None,
        batch_size: int = 1000,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            query = (
                self._client.table("user_predictions")
                .select("*")
                .order("ticker")
                .order("target_date")
            )
            if status is not None:
                query = query.eq("status", status)

            response = query.range(start, end).execute()
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
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
            "scored_at",
        }
        written = 0
        for batch in _chunks(rows, batch_size):
            cleaned_batch = [
                {key: value for key, value in row.items() if key in table_columns}
                for row in batch
            ]
            self._client.table("user_prediction_scores").upsert(
                cleaned_batch,
                on_conflict="prediction_id",
            ).execute()
            written += len(cleaned_batch)

        return written

    def fetch_user_prediction_scores(
        self,
        batch_size: int = 1000,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        start = 0

        while True:
            end = start + batch_size - 1
            response = (
                self._client.table("user_prediction_scores")
                .select("*")
                .order("scored_at")
                .range(start, end)
                .execute()
            )
            batch = response.data or []
            rows.extend(batch)

            if len(batch) < batch_size:
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
