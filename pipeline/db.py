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
