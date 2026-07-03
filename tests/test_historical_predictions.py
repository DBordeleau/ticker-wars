from __future__ import annotations

import unittest
from datetime import date, timedelta

import numpy as np
import pandas as pd

from pipeline.config import Settings
from pipeline.features.build_features import FEATURE_COLUMNS
from pipeline.models.historical import (
    resolve_seed_targets_for_window,
    seed_predictions_for_target_window,
)


class FakeTimesFMModel:
    def __init__(self) -> None:
        self.forecast_calls: list[dict[str, object]] = []

    def forecast(self, *, horizon: int, inputs: list[np.ndarray]):
        self.forecast_calls.append({"horizon": horizon, "inputs": inputs})
        point_forecast = np.array([[100.0 + step for step in range(1, horizon + 1)]])
        quantile_forecast = np.zeros((1, horizon, 10))
        for step in range(horizon):
            point = point_forecast[0, step]
            quantile_forecast[0, step, 1] = point - 5.0
            quantile_forecast[0, step, 9] = point + 5.0
        return point_forecast, quantile_forecast


class FakeChronosModel:
    def __init__(self) -> None:
        self.predict_calls: list[dict[str, object]] = []

    def predict_df(
        self,
        context: pd.DataFrame,
        *,
        prediction_length: int,
        quantile_levels: list[float],
        id_column: str,
        timestamp_column: str,
        target: str,
        freq: str,
    ) -> pd.DataFrame:
        self.predict_calls.append({"context": context, "prediction_length": prediction_length})
        latest_timestamp = pd.Timestamp(context["timestamp"].iloc[-1])
        return pd.DataFrame(
            {
                "id": "AAPL",
                "timestamp": pd.date_range(
                    latest_timestamp + pd.Timedelta(days=1),
                    periods=prediction_length,
                    freq="D",
                ),
                "predictions": [100.0 + step for step in range(1, prediction_length + 1)],
                "0.1": [95.0 + step for step in range(1, prediction_length + 1)],
                "0.5": [100.0 + step for step in range(1, prediction_length + 1)],
                "0.9": [105.0 + step for step in range(1, prediction_length + 1)],
            }
        )


class HistoricalPredictionTest(unittest.TestCase):
    def test_seed_target_resolver_finds_july_launch_dates(self) -> None:
        candidate_dates = [
            date(2025, 7, 1),
            date(2025, 7, 2),
            date(2026, 4, 1),
            date(2026, 4, 2),
            date(2026, 6, 1),
            date(2026, 6, 2),
            date(2026, 6, 24),
            date(2026, 6, 25),
        ]

        targets = resolve_seed_targets_for_window(
            candidate_dates=candidate_dates,
            target_start=date(2026, 7, 1),
            target_end=date(2026, 7, 2),
        )

        keys = {
            (target.target.target_date, target.horizon, target.prediction_date)
            for target in targets
        }
        self.assertEqual(
            keys,
            {
                (date(2026, 7, 1), "1w", date(2026, 6, 24)),
                (date(2026, 7, 1), "1m", date(2026, 6, 1)),
                (date(2026, 7, 1), "3m", date(2026, 4, 1)),
                (date(2026, 7, 1), "1y", date(2025, 7, 1)),
                (date(2026, 7, 2), "1w", date(2026, 6, 25)),
                (date(2026, 7, 2), "1m", date(2026, 6, 2)),
                (date(2026, 7, 2), "3m", date(2026, 4, 2)),
                (date(2026, 7, 2), "1y", date(2025, 7, 2)),
            },
        )

    def test_baseline_seed_uses_as_of_feature_and_excludes_future_interval_rows(self) -> None:
        result = seed_predictions_for_target_window(
            feature_rows=[
                _feature_row(
                    "AAPL",
                    "2026-06-24",
                    target_date_1w="2026-07-01",
                    target_return_1w=0.50,
                ),
                _feature_row(
                    "AAPL",
                    "2026-06-25",
                    target_date_1w="2026-07-02",
                    target_return_1w=0.25,
                ),
            ],
            price_rows=[
                _price_row("AAPL", "2026-06-24", 100.0),
                _price_row("AAPL", "2026-06-25", 125.0),
            ],
            settings=Settings(),
            target_start=date(2026, 7, 1),
            target_end=date(2026, 7, 1),
            model_slugs=("baseline",),
        )

        self.assertEqual(len(result.prediction_rows), 1)
        row = result.prediction_rows[0]
        self.assertEqual(row["prediction_id"], "AAPL:2026-06-24:2026-07-01:1w:baseline")
        self.assertEqual(row["reference_close"], 100.0)
        self.assertNotIn("interval_method", row)

    def test_classic_seed_uses_pooled_fallback_without_future_rows(self) -> None:
        pooled_rows = [
            _feature_row(
                "MSFT",
                (date(2025, 12, 1) + timedelta(days=index)).isoformat(),
                target_date_1w=(date(2025, 12, 8) + timedelta(days=index)).isoformat(),
                target_return_1w=0.01 + index / 10_000,
            )
            for index in range(120)
        ]

        result = seed_predictions_for_target_window(
            feature_rows=[
                _feature_row("AAPL", "2026-06-24", target_date_1w="2026-07-01"),
                *pooled_rows,
                _feature_row(
                    "MSFT",
                    "2026-06-25",
                    target_date_1w="2026-07-02",
                    target_return_1w=9.99,
                ),
            ],
            price_rows=[_price_row("AAPL", "2026-06-24", 100.0)],
            settings=Settings(),
            target_start=date(2026, 7, 1),
            target_end=date(2026, 7, 1),
            model_slugs=("linear-regression",),
        )

        self.assertEqual(len(result.prediction_rows), 1)
        row = result.prediction_rows[0]
        self.assertEqual(row["model_slug"], "linear-regression")
        self.assertEqual(row["model_metadata"]["training_scope"], "pooled")
        self.assertEqual(row["model_metadata"]["training_row_count"], 120)

    def test_timesfm_seed_truncates_price_history_to_prediction_date(self) -> None:
        fake_model = FakeTimesFMModel()

        result = seed_predictions_for_target_window(
            feature_rows=[_feature_row("AAPL", "2026-06-24")],
            price_rows=[
                _price_row("AAPL", "2026-06-24", 100.0),
                _price_row("AAPL", "2026-06-25", 999.0),
            ],
            settings=Settings(timesfm_enabled=True, timesfm_context_length=32),
            target_start=date(2026, 7, 1),
            target_end=date(2026, 7, 1),
            model_slugs=("timesfm",),
            timesfm_model_loader=lambda _settings, _max_horizon: fake_model,
        )

        self.assertEqual(len(result.prediction_rows), 1)
        close_history = fake_model.forecast_calls[0]["inputs"][0]
        self.assertEqual(close_history.tolist(), [100.0])

    def test_chronos_seed_truncates_price_history_to_prediction_date(self) -> None:
        fake_model = FakeChronosModel()

        result = seed_predictions_for_target_window(
            feature_rows=[_feature_row("AAPL", "2026-06-24")],
            price_rows=[
                _price_row("AAPL", "2026-06-24", 100.0),
                _price_row("AAPL", "2026-06-25", 999.0),
            ],
            settings=Settings(chronos_enabled=True, chronos_context_length=32),
            target_start=date(2026, 7, 1),
            target_end=date(2026, 7, 1),
            model_slugs=("chronos-2",),
            chronos_model_loader=lambda _settings: fake_model,
        )

        self.assertEqual(len(result.prediction_rows), 1)
        context = fake_model.predict_calls[0]["context"]
        self.assertEqual(context["target"].tolist(), [100.0])


def _feature_row(
    ticker: str,
    row_date: str,
    *,
    target_date_1w: str | None = None,
    target_return_1w: float | None = None,
) -> dict[str, object]:
    value = float(date.fromisoformat(row_date).toordinal() % 17) / 100
    return {
        "ticker": ticker,
        "date": row_date,
        "feature_json": {column: value for column in FEATURE_COLUMNS},
        "target_date_1w": target_date_1w,
        "target_date_1m": None,
        "target_date_3m": None,
        "target_date_1y": None,
        "target_return_1w": target_return_1w,
        "target_return_1m": None,
        "target_return_3m": None,
        "target_return_1y": None,
    }


def _price_row(ticker: str, row_date: str, close: float) -> dict[str, object]:
    return {
        "ticker": ticker,
        "date": row_date,
        "close": close,
        "volume": 1_000_000,
    }


if __name__ == "__main__":
    unittest.main()
