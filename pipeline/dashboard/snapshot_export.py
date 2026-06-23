from __future__ import annotations

import json
from pathlib import Path
from typing import Any

SNAPSHOT_FILENAMES: dict[str, str] = {
    "dashboard_latest_predictions": "latest_predictions.json",
    "dashboard_model_leaderboard": "model_leaderboard.json",
    "dashboard_ticker_history": "ticker_history.json",
    "dashboard_model_metrics": "model_metrics.json",
    "dashboard_run_metadata": "run_metadata.json",
    "dashboard_user_leaderboard": "user_leaderboard.json",
    "dashboard_latest_user_predictions": "latest_user_predictions.json",
}


def export_dashboard_snapshots(
    dashboard_tables: dict[str, list[dict[str, Any]]],
    export_dir: str,
) -> dict[str, int]:
    output_dir = Path(export_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}

    for table_name, filename in SNAPSHOT_FILENAMES.items():
        rows = dashboard_tables.get(table_name, [])
        output_path = output_dir / filename
        output_path.write_text(json.dumps(rows, indent=2, default=str), encoding="utf-8")
        counts[filename] = len(rows)

    return counts
