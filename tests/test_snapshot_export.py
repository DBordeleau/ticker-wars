from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from pipeline.dashboard.snapshot_export import export_dashboard_snapshots


class SnapshotExportTest(unittest.TestCase):
    def test_exports_dashboard_tables_to_expected_json_files(self) -> None:
        tables = {
            "dashboard_latest_predictions": [{"ticker": "AAPL"}],
            "dashboard_model_leaderboard": [{"model_name": "Baseline"}],
            "dashboard_ticker_history": [],
            "dashboard_model_metrics": [{"model_name": "Baseline", "scored_count": 1}],
            "dashboard_run_metadata": [{"last_pipeline_status": "success"}],
            "dashboard_user_leaderboard": [{"username": "Ada"}],
            "dashboard_user_ticker_leaderboard": [{"username": "Ada", "ticker": "AAPL"}],
            "dashboard_latest_user_predictions": [{"username": "Ada", "ticker": "AAPL"}],
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            counts = export_dashboard_snapshots(tables, tmpdir)
            latest_path = Path(tmpdir) / "latest_predictions.json"
            metadata_path = Path(tmpdir) / "run_metadata.json"

            self.assertEqual(counts["latest_predictions.json"], 1)
            self.assertEqual(counts["ticker_history.json"], 0)
            self.assertEqual(counts["model_metrics.json"], 1)
            self.assertEqual(counts["user_leaderboard.json"], 1)
            self.assertEqual(counts["user_ticker_leaderboard.json"], 1)
            self.assertEqual(counts["latest_user_predictions.json"], 1)
            self.assertEqual(json.loads(latest_path.read_text())[0]["ticker"], "AAPL")
            self.assertEqual(
                json.loads(metadata_path.read_text())[0]["last_pipeline_status"],
                "success",
            )


if __name__ == "__main__":
    unittest.main()
