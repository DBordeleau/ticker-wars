from __future__ import annotations

import unittest
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from pipeline.commands.dashboard import run_refresh_and_export_dashboard
from pipeline.config import Settings


class DashboardCommandTest(unittest.TestCase):
    def test_combined_publish_builds_dashboard_tables_once(self) -> None:
        database = Mock()
        database.replace_dashboard_table.side_effect = lambda _name, rows: len(rows)
        database.refresh_competitive_depth.return_value = {"profiles": 1}
        database.refresh_public_user_profiles.return_value = 1
        dashboard_tables = {
            "dashboard_latest_predictions": [{"ticker": "AAPL"}],
            "dashboard_model_leaderboard": [{"model_name": "Baseline"}],
            "dashboard_ticker_history": [],
            "dashboard_model_metrics": [],
            "dashboard_run_metadata": [{"last_pipeline_status": "success"}],
            "dashboard_user_leaderboard": [],
            "dashboard_user_ticker_leaderboard": [],
            "dashboard_latest_user_predictions": [],
        }

        with TemporaryDirectory() as export_dir:
            settings = Settings(export_dir=export_dir)
            with (
                patch("pipeline.commands.dashboard.load_settings", return_value=settings),
                patch(
                    "pipeline.commands.dashboard.SupabaseDatabase.from_settings",
                    return_value=database,
                ),
                patch(
                    "pipeline.commands.dashboard.build_dashboard_tables_from_database",
                    return_value=dashboard_tables,
                ) as build,
                patch(
                    "pipeline.commands.dashboard.export_dashboard_snapshots",
                    return_value={"latest_predictions.json": 1},
                ) as export,
            ):
                self.assertEqual(run_refresh_and_export_dashboard(), 0)

        build.assert_called_once_with(database, settings)
        export.assert_called_once_with(dashboard_tables, export_dir)
        self.assertEqual(
            database.replace_dashboard_table.call_count,
            len(dashboard_tables),
        )
        database.refresh_competitive_depth.assert_called_once_with()
        database.refresh_public_user_profiles.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
