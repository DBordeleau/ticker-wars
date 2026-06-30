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
        self.rpc_results: dict[str, Any] = {}

    def table(self, name: str) -> FakeTable:
        return FakeTable(self, name)

    def rpc(self, name: str, params: dict[str, Any]) -> FakeRpc:
        return FakeRpc(self, name, params)


class FakeRpc:
    def __init__(self, client: FakeSupabaseClient, name: str, params: dict[str, Any]) -> None:
        self.client = client
        self.name = name
        self.params = params

    def execute(self) -> FakeResponse:
        self.client.operations.append(
            {
                "action": "rpc",
                "rpc": self.name,
                "params": self.params,
            }
        )
        return FakeResponse(self.client.rpc_results.get(self.name, ["event-id"]))


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

    def insert(self, rows: dict[str, Any] | list[dict[str, Any]]) -> FakeTable:
        self.operation.update(
            action="insert",
            rows=rows,
        )
        return self

    def select(self, columns: str) -> FakeTable:
        self.operation.update(action="select", columns=columns)
        return self

    def update(self, values: dict[str, Any]) -> FakeTable:
        self.operation.update(action="update", values=values)
        return self

    def delete(self) -> FakeTable:
        self.operation.update(action="delete")
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

    def lt(self, column: str, value: Any) -> FakeTable:
        self.operation.setdefault("filters", []).append(("lt", column, value))
        return self

    def range(self, start: int, end: int) -> FakeTable:
        self.range_start = start
        self.range_end = end
        self.operation["range"] = (start, end)
        return self

    def limit(self, count: int) -> FakeTable:
        self.range_start = 0
        self.range_end = count - 1
        self.operation["limit"] = count
        return self

    def execute(self) -> FakeResponse:
        self.client.operations.append(dict(self.operation))
        if self.operation.get("action") != "select":
            return FakeResponse()

        rows = self.client.data.get(self.name, [])
        for filter_type, column, value in self.operation.get("filters", []):
            if filter_type == "eq":
                rows = [row for row in rows if row.get(column) == value]
            if filter_type == "in":
                rows = [row for row in rows if row.get(column) in value]
        for column, desc in reversed(self.operation.get("order", [])):
            rows = sorted(rows, key=lambda row: row.get(column), reverse=desc)
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

    def test_fetch_latest_price_dates_reads_one_recent_row_per_ticker(self) -> None:
        database, client = _database_with_fake_client()
        client.data["prices"] = [
            {"ticker": "AAPL", "date": "2026-01-03"},
            {"ticker": "AAPL", "date": "2026-01-02"},
            {"ticker": "MSFT", "date": "2026-01-04"},
        ]

        rows = database.fetch_latest_price_dates(("AAPL", "MSFT", "GME"))

        self.assertEqual(rows, {"AAPL": "2026-01-03", "MSFT": "2026-01-04"})
        self.assertEqual([operation["table"] for operation in client.operations], ["prices"] * 3)
        self.assertEqual(client.operations[0]["columns"], "ticker,date")
        self.assertIn(("eq", "ticker", "AAPL"), client.operations[0]["filters"])
        self.assertEqual(client.operations[0]["order"], [("date", True)])
        self.assertEqual(client.operations[0]["limit"], 1)

    def test_fetch_latest_feature_dates_reads_one_recent_row_per_ticker(self) -> None:
        database, client = _database_with_fake_client()
        client.data["features"] = [
            {"ticker": "AAPL", "date": "2026-01-03"},
            {"ticker": "AAPL", "date": "2026-01-02"},
            {"ticker": "MSFT", "date": "2026-01-04"},
        ]

        rows = database.fetch_latest_feature_dates(("AAPL", "MSFT", "GME"))

        self.assertEqual(rows, {"AAPL": "2026-01-03", "MSFT": "2026-01-04"})
        self.assertEqual([operation["table"] for operation in client.operations], ["features"] * 3)
        self.assertEqual(client.operations[0]["columns"], "ticker,date")
        self.assertIn(("eq", "ticker", "AAPL"), client.operations[0]["filters"])
        self.assertEqual(client.operations[0]["order"], [("date", True)])
        self.assertEqual(client.operations[0]["limit"], 1)

    def test_live_price_methods_use_live_tables(self) -> None:
        database, client = _database_with_fake_client()
        snapshots = [
            {
                "ticker": "AAPL",
                "provider": "yfinance",
                "provider_symbol": "AAPL",
                "market_state": "regular",
                "price": 205.5,
                "as_of": "2026-06-29T14:31:00+00:00",
                "fetched_at": "2026-06-29T14:31:04+00:00",
                "stale_after": "2026-06-29T14:32:19+00:00",
            }
        ]
        bars = [
            {
                "ticker": "AAPL",
                "ts": "2026-06-29T14:31:00+00:00",
                "provider": "yfinance",
                "provider_symbol": "AAPL",
                "close": 205.5,
            }
        ]
        event = {
            "provider": "yfinance",
            "requested_tickers": ["AAPL"],
            "succeeded_tickers": ["AAPL"],
            "failed_tickers": [],
            "started_at": "2026-06-29T14:31:00+00:00",
            "finished_at": "2026-06-29T14:31:02+00:00",
            "duration_ms": 2000,
            "error_message": None,
        }

        snapshot_count = database.upsert_live_price_snapshots(snapshots)
        bar_count = database.upsert_intraday_price_bars(bars)
        database.delete_intraday_price_bars_before("2026-06-29T04:00:00+00:00")
        event_count = database.insert_live_price_fetch_event(event)
        client.data["live_price_snapshots"] = snapshots
        fetched_snapshots = database.fetch_live_price_snapshots(("AAPL",))

        self.assertEqual(snapshot_count, 1)
        self.assertEqual(bar_count, 1)
        self.assertEqual(event_count, 1)
        self.assertEqual(fetched_snapshots, snapshots)
        self.assertEqual(client.operations[0]["table"], "live_price_snapshots")
        self.assertEqual(client.operations[0]["action"], "upsert")
        self.assertEqual(client.operations[0]["on_conflict"], "ticker")
        self.assertEqual(client.operations[1]["table"], "intraday_price_bars")
        self.assertEqual(client.operations[1]["action"], "upsert")
        self.assertEqual(client.operations[1]["on_conflict"], "ticker,ts")
        self.assertEqual(client.operations[2]["table"], "intraday_price_bars")
        self.assertEqual(client.operations[2]["action"], "delete")
        self.assertIn(("lt", "ts", "2026-06-29T04:00:00+00:00"), client.operations[2]["filters"])
        self.assertEqual(client.operations[3]["table"], "live_price_fetch_events")
        self.assertEqual(client.operations[3]["action"], "insert")
        self.assertEqual(client.operations[3]["rows"], event)
        self.assertEqual(client.operations[4]["table"], "live_price_snapshots")
        self.assertEqual(client.operations[4]["action"], "select")
        self.assertIn(("in", "ticker", ["AAPL"]), client.operations[4]["filters"])

    def test_ticker_asset_cache_round_trip_methods_use_ticker_assets(self) -> None:
        database, client = _database_with_fake_client()
        rows = [
            {
                "ticker": "AAPL",
                "logo_data_url": "data:image/png;base64,abc",
                "logo_source": "hunter",
            }
        ]

        written = database.upsert_ticker_assets(rows)
        client.data["ticker_assets"] = rows
        fetched = database.fetch_ticker_assets()

        self.assertEqual(written, 1)
        self.assertEqual(fetched, rows)
        self.assertEqual(client.operations[0]["table"], "ticker_assets")
        self.assertEqual(client.operations[0]["action"], "upsert")
        self.assertEqual(client.operations[0]["on_conflict"], "ticker")
        self.assertEqual(client.operations[1]["table"], "ticker_assets")

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
                "score_verdict": "called_it",
                "score_verdict_rank": 1,
                "score_verdict_color": "yellow",
                "xp_awarded": 295,
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
        self.assertEqual(client.operations[0]["rows"][0]["score_verdict"], "called_it")
        self.assertEqual(client.operations[0]["rows"][0]["xp_awarded"], 295)

    def test_fetch_user_predictions_can_filter_by_status(self) -> None:
        database, client = _database_with_fake_client()
        client.data["user_predictions"] = [
            {"prediction_id": "prediction-1", "status": "pending"}
        ]

        rows = database.fetch_user_predictions(status="pending")

        self.assertEqual(rows, [{"prediction_id": "prediction-1", "status": "pending"}])
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

    def test_grant_scored_prediction_rewards_calls_rpc_once_per_prediction(self) -> None:
        database, client = _database_with_fake_client()

        granted = database.grant_scored_prediction_rewards(["prediction-1", "prediction-2"])

        self.assertEqual(granted, 2)
        self.assertEqual(
            [operation["rpc"] for operation in client.operations],
            ["grant_scored_prediction_reward", "grant_scored_prediction_reward"],
        )
        self.assertEqual(
            client.operations[0]["params"],
            {"p_prediction_id": "prediction-1"},
        )

    def test_refresh_public_user_profiles_calls_projection_rpc(self) -> None:
        database, client = _database_with_fake_client()
        client.rpc_results["refresh_public_user_profiles"] = 3

        refreshed = database.refresh_public_user_profiles()

        self.assertEqual(refreshed, 3)
        self.assertEqual(client.operations[0]["rpc"], "refresh_public_user_profiles")
        self.assertEqual(client.operations[0]["params"], {})


def _database_with_fake_client() -> tuple[SupabaseDatabase, FakeSupabaseClient]:
    database = object.__new__(SupabaseDatabase)
    client = FakeSupabaseClient()
    database._client = client
    return database, client


if __name__ == "__main__":
    unittest.main()
