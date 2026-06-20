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

    def upsert_predictions(self, rows: list[dict[str, Any]], batch_size: int = 500) -> int:
        if not rows:
            return 0

        written = 0
        for batch in _chunks(rows, batch_size):
            self._client.table("predictions").upsert(
                batch,
                on_conflict="ticker,target_date,model_name",
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
