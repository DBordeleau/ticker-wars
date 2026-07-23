from __future__ import annotations

import logging
from typing import Any

from pipeline.config import Settings, load_settings
from pipeline.dashboard.refresh import build_dashboard_tables
from pipeline.dashboard.snapshot_export import export_dashboard_snapshots
from pipeline.db import SupabaseDatabase

LOGGER = logging.getLogger(__name__)


def run_refresh_dashboard() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Dashboard refresh skipped because Supabase credentials are not configured.")
        return 0

    dashboard_tables = build_dashboard_tables_from_database(database, settings)
    refresh_dashboard_tables(database, dashboard_tables)

    return 0


def run_export_snapshot() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Snapshot export skipped because Supabase credentials are not configured.")
        return 0

    dashboard_tables = build_dashboard_tables_from_database(database, settings)
    export_dashboard_tables(dashboard_tables, settings.export_dir)

    return 0


def run_refresh_and_export_dashboard() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info(
            "Dashboard refresh and snapshot export skipped because Supabase credentials "
            "are not configured."
        )
        return 0

    dashboard_tables = build_dashboard_tables_from_database(database, settings)
    refresh_dashboard_tables(database, dashboard_tables)
    export_dashboard_tables(dashboard_tables, settings.export_dir)

    return 0


def refresh_dashboard_tables(
    database: SupabaseDatabase,
    dashboard_tables: dict[str, list[dict[str, Any]]],
) -> None:
    for table_name, rows in dashboard_tables.items():
        written = database.replace_dashboard_table(table_name, rows)
        LOGGER.info("Refreshed %s with %s rows.", table_name, written)

    competitive_counts = database.refresh_competitive_depth()
    if competitive_counts:
        LOGGER.info("Refreshed competitive depth projections: %s.", competitive_counts)

    refreshed_profiles = database.refresh_public_user_profiles()
    LOGGER.info("Refreshed %s public user profile projections.", refreshed_profiles)


def export_dashboard_tables(
    dashboard_tables: dict[str, list[dict[str, Any]]],
    export_dir: str,
) -> None:
    counts = export_dashboard_snapshots(dashboard_tables, export_dir)
    for filename, count in counts.items():
        LOGGER.info("Exported %s with %s rows.", filename, count)


def build_dashboard_tables_from_database(
    database: SupabaseDatabase,
    settings: Settings | None = None,
) -> dict[str, list[dict[str, Any]]]:
    settings = settings or load_settings()
    return build_dashboard_tables(
        prediction_rows=database.fetch_predictions(),
        score_rows=database.fetch_prediction_scores(),
        price_rows=database.fetch_prices(),
        user_prediction_rows=database.fetch_user_predictions(),
        user_score_rows=database.fetch_user_prediction_scores(),
        user_profile_rows=database.fetch_user_profiles(),
        settings=settings,
    )
