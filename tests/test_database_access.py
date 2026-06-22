from __future__ import annotations

import inspect
import unittest
from dataclasses import dataclass
from typing import Any

from pipeline.db import SupabaseDatabase


@dataclass
class FakeResponse:
    data: list[dict[str, Any]] | None = None


class FakeSupabaseClient:
    def __init__(self) -> None:
        self.data: dict[str, list[dict[str, Any]]] = {}
        self.operations: list[dict[str, Any]] = []

    def table(self, name: str) -> FakeTable:
        return FakeTable(self, name)


class FakeTable:
    def __init__(self, client: FakeSupabaseClient, name: str) -> None:
        self.client = client
        self.name = name
        self.operation: dict[str, Any] = {"table": name}
        self.range_start = 0
        self.range_end = 999

    def upsert(
        self,
        rows: list[dict[str, Any]],
        on_conflict: str | None = None,
    ) -> FakeTable:
        self.operation.update(
            action="upsert",
            rows=rows,
            on_conflict=on_conflict,
        )
        return self

    def select(self, columns: str) -> FakeTable:
        self.operation.update(action="select", columns=columns)
        return self

    def order(self, column: str, desc: bool = False) -> FakeTable:
        self.operation.setdefault("order", []).append((column, desc))
        return self

    def range(self, start: int, end: int) -> FakeTable:
        self.range_start = start
        self.range_end = end
        self.operation["range"] = (start, end)
        return self

    def execute(self) -> FakeResponse:
        self.client.operations.append(dict(self.operation))
        if self.operation.get("action") != "select":
            return FakeResponse()

        rows = self.client.data.get(self.name, [])
        return FakeResponse(rows[self.range_start : self.range_end + 1])


class DatabaseAccessTest(unittest.TestCase):
    def test_prediction_methods_are_the_only_public_prediction_accessors(self) -> None:
        expected_methods = {
            "upsert_predictions",
            "fetch_predictions",
            "upsert_prediction_scores",
            "fetch_prediction_scores",
        }
        forbidden_methods = {
            "upsert_forecasts",
            "fetch_forecasts",
            "upsert_forecast_scores",
            "fetch_forecast_scores",
        }

        for method_name in expected_methods:
            self.assertTrue(hasattr(SupabaseDatabase, method_name))
        for method_name in forbidden_methods:
            self.assertFalse(hasattr(SupabaseDatabase, method_name))

    def test_database_access_does_not_depend_on_forecast_table_names(self) -> None:
        source = inspect.getsource(SupabaseDatabase)

        self.assertNotIn('"forecasts"', source)
        self.assertNotIn('"forecast_scores"', source)

    def test_upsert_predictions_writes_to_predictions_table(self) -> None:
        database, client = _database_with_fake_client()
        rows = [
            {
                "prediction_id": "AAPL:2026-01-02:baseline",
                "ticker": "AAPL",
                "target_date": "2026-01-02",
                "model_name": "Baseline",
            }
        ]

        written = database.upsert_predictions(rows)

        self.assertEqual(written, 1)
        self.assertEqual(client.operations[0]["table"], "predictions")
        self.assertEqual(client.operations[0]["action"], "upsert")
        self.assertEqual(client.operations[0]["on_conflict"], "ticker,target_date,model_name")
        self.assertEqual(client.operations[0]["rows"], rows)

    def test_prediction_score_upsert_writes_only_known_score_columns(self) -> None:
        database, client = _database_with_fake_client()
        rows = [
            {
                "prediction_id": "AAPL:2026-01-02:baseline",
                "actual_close": 101.0,
                "actual_return": 0.01,
                "absolute_error": 0.5,
                "squared_error": 0.25,
                "absolute_pct_error": 0.0049,
                "predicted_direction": 1,
                "actual_direction": 1,
                "direction_correct": 1,
                "scored_at": "2026-01-03T00:00:00+00:00",
                "transient_pipeline_field": "do not persist",
            }
        ]

        written = database.upsert_prediction_scores(rows)

        self.assertEqual(written, 1)
        self.assertEqual(client.operations[0]["table"], "prediction_scores")
        self.assertEqual(client.operations[0]["action"], "upsert")
        self.assertEqual(client.operations[0]["on_conflict"], "prediction_id")
        self.assertNotIn("transient_pipeline_field", client.operations[0]["rows"][0])

    def test_fetch_latest_fundamentals_coexists_with_prediction_access(self) -> None:
        database, client = _database_with_fake_client()
        client.data["fundamentals"] = [
            {"ticker": "AAPL", "as_of_date": "2026-01-03", "market_cap": 3.2e12},
            {"ticker": "AAPL", "as_of_date": "2026-01-01", "market_cap": 3.1e12},
            {"ticker": "MSFT", "as_of_date": "2026-01-03", "market_cap": 3.0e12},
        ]

        rows = database.fetch_latest_fundamentals(batch_size=2)

        self.assertEqual(
            rows,
            [
                {"ticker": "AAPL", "as_of_date": "2026-01-03", "market_cap": 3.2e12},
                {"ticker": "MSFT", "as_of_date": "2026-01-03", "market_cap": 3.0e12},
            ],
        )
        self.assertEqual(client.operations[0]["table"], "fundamentals")


def _database_with_fake_client() -> tuple[SupabaseDatabase, FakeSupabaseClient]:
    database = object.__new__(SupabaseDatabase)
    client = FakeSupabaseClient()
    database._client = client
    return database, client


if __name__ == "__main__":
    unittest.main()
