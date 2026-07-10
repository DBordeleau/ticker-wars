from __future__ import annotations

import logging
from typing import Any

from pipeline.config import load_settings
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

    dashboard_tables = build_dashboard_tables_from_database(database)

    for table_name, rows in dashboard_tables.items():
        written = database.replace_dashboard_table(table_name, rows)
        LOGGER.info("Refreshed %s with %s rows.", table_name, written)

    competitive_counts = database.refresh_competitive_depth()
    if competitive_counts:
        LOGGER.info("Refreshed competitive depth projections: %s.", competitive_counts)

    refreshed_profiles = database.refresh_public_user_profiles()
    LOGGER.info("Refreshed %s public user profile projections.", refreshed_profiles)

    return 0


def run_export_snapshot() -> int:
    settings = load_settings()
    database = SupabaseDatabase.from_settings(settings)
    if database is None:
        LOGGER.info("Snapshot export skipped because Supabase credentials are not configured.")
        return 0

    dashboard_tables = build_dashboard_tables_from_database(database)
    counts = export_dashboard_snapshots(dashboard_tables, settings.export_dir)
    for filename, count in counts.items():
        LOGGER.info("Exported %s with %s rows.", filename, count)

    return 0


def build_dashboard_tables_from_database(
    database: SupabaseDatabase,
) -> dict[str, list[dict[str, Any]]]:
    settings = load_settings()
    return build_dashboard_tables(
        prediction_rows=database.fetch_predictions(),
        score_rows=database.fetch_prediction_scores(),
        price_rows=database.fetch_prices(),
        user_prediction_rows=database.fetch_user_predictions(),
        user_score_rows=database.fetch_user_prediction_scores(),
        user_profile_rows=database.fetch_user_profiles(),
        settings=settings,
    )
