from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    market_data_source: str = "yfinance"
    supabase_url: str | None = None
    supabase_secret_key: str | None = None
    supabase_publishable_key: str | None = None
    llm_provider: str = "gemini"
    warren_buffbot_enabled: bool = False
    export_dir: str = "data_exports"
    start_date: str = "2020-01-01"


def load_settings() -> Settings:
    load_dotenv()

    return Settings(
        market_data_source=os.getenv("MARKET_DATA_SOURCE", "yfinance"),
        supabase_url=os.getenv("SUPABASE_URL"),
        supabase_secret_key=os.getenv("SUPABASE_SECRET_KEY"),
        supabase_publishable_key=os.getenv("SUPABASE_PUBLISHABLE_KEY"),
        llm_provider=os.getenv("LLM_PROVIDER", "gemini"),
        warren_buffbot_enabled=os.getenv("WARREN_BUFFBOT_ENABLED", "false").lower()
        in {"1", "true", "yes"},
        export_dir=os.getenv("EXPORT_DIR", "data_exports"),
        start_date=os.getenv("START_DATE", "2020-01-01"),
    )
