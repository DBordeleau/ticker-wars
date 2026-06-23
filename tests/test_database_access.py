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

    def update(self, values: dict[str, Any]) -> FakeTable:
        self.operation.update(action="update", values=values)
        return self

    def order(self, column: str, desc: bool = False) -> FakeTable:
        self.operation.setdefault("order", []).append((column, desc))
        return self

    def eq(self, column: str, value: Any) -> FakeTable:
        self.operation.setdefault("filters", []).append(("eq", column, value))
        return self

    def in_(self, column: str, values: list[Any]) -> FakeTable:
        self.operation.setdefault("filters", []).append(("in", column, values))
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
        self.assertEqual(
            client.operations[0]["on_conflict"],
            "ticker,prediction_date,target_date,prediction_horizon,model_slug",
        )
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
                "interval_hit": True,
                "interval_width": 10.0,
                "interval_width_pct": 0.1,
                "interval_miss_distance": 0.0,
                "winkler_score": 10.0,
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
        self.assertEqual(client.operations[0]["rows"][0]["winkler_score"], 10.0)

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

    def test_user_prediction_score_upsert_writes_only_known_score_columns(self) -> None:
        database, client = _database_with_fake_client()
        rows = [
            {
                "prediction_id": "11111111-1111-1111-1111-111111111111",
                "user_id": "22222222-2222-2222-2222-222222222222",
                "ticker": "AAPL",
                "prediction_date": "2026-01-01",
                "target_date": "2026-01-08",
                "prediction_horizon": "1w",
                "actual_close": 101.0,
                "actual_return": 0.01,
                "absolute_error": 1.0,
                "squared_error": 1.0,
                "absolute_pct_error": 0.0099,
                "predicted_direction": 1,
                "actual_direction": 1,
                "direction_correct": 1,
                "scored_at": "2026-01-08T12:00:00+00:00",
                "transient_pipeline_field": "do not persist",
            }
        ]

        written = database.upsert_user_prediction_scores(rows)

        self.assertEqual(written, 1)
        self.assertEqual(client.operations[0]["table"], "user_prediction_scores")
        self.assertEqual(client.operations[0]["action"], "upsert")
        self.assertEqual(client.operations[0]["on_conflict"], "prediction_id")
        self.assertNotIn("transient_pipeline_field", client.operations[0]["rows"][0])

    def test_fetch_user_predictions_can_filter_by_status(self) -> None:
        database, client = _database_with_fake_client()
        client.data["user_predictions"] = [{"prediction_id": "prediction-1"}]

        rows = database.fetch_user_predictions(status="pending")

        self.assertEqual(rows, [{"prediction_id": "prediction-1"}])
        self.assertEqual(client.operations[0]["table"], "user_predictions")
        self.assertIn(("eq", "status", "pending"), client.operations[0]["filters"])

    def test_mark_user_predictions_scored_updates_matching_ids(self) -> None:
        database, client = _database_with_fake_client()

        written = database.mark_user_predictions_scored(["prediction-1", "prediction-2"])

        self.assertEqual(written, 2)
        self.assertEqual(client.operations[0]["table"], "user_predictions")
        self.assertEqual(client.operations[0]["action"], "update")
        self.assertEqual(client.operations[0]["values"], {"status": "scored"})
        self.assertIn(
            ("in", "prediction_id", ["prediction-1", "prediction-2"]),
            client.operations[0]["filters"],
        )


def _database_with_fake_client() -> tuple[SupabaseDatabase, FakeSupabaseClient]:
    database = object.__new__(SupabaseDatabase)
    client = FakeSupabaseClient()
    database._client = client
    return database, client


if __name__ == "__main__":
    unittest.main()
