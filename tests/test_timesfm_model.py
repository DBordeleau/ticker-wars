from __future__ import annotations

import unittest
from datetime import date, timedelta

import numpy as np

from pipeline.config import Settings
from pipeline.forecasting.horizons import FORECAST_HORIZONS
from pipeline.models.timesfm_model import generate_timesfm_predictions


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


class TimesFMModelTest(unittest.TestCase):
    def test_disabled_timesfm_returns_no_predictions(self) -> None:
        rows = generate_timesfm_predictions(
            price_rows=_price_rows("AAPL", close=100.0),
            settings=Settings(timesfm_enabled=False),
            model_loader=lambda _settings, _max_horizon: FakeTimesFMModel(),
        )

        self.assertEqual(rows, [])

    def test_enabled_timesfm_generates_horizon_prediction_rows(self) -> None:
        fake_model = FakeTimesFMModel()

        rows = generate_timesfm_predictions(
            price_rows=_price_rows("AAPL", close=100.0),
            settings=Settings(
                timesfm_enabled=True,
                timesfm_model_id="google/timesfm-2.5-200m-pytorch",
                timesfm_context_length=32,
            ),
            model_loader=lambda _settings, _max_horizon: fake_model,
        )

        self.assertEqual(len(rows), 4)
        self.assertEqual({row["prediction_horizon"] for row in rows}, set(FORECAST_HORIZONS))
        self.assertTrue(all(row["model_name"] == "TimesFM" for row in rows))
        self.assertTrue(all(row["model_slug"] == "timesfm" for row in rows))
        self.assertTrue(all(row["interval_method"] == "timesfm-quantiles" for row in rows))
        self.assertTrue(all(row["interval_level"] == 0.80 for row in rows))
        self.assertTrue(
            all(row["model_metadata"]["checkpoint_id"] == "google/timesfm-2.5-200m-pytorch"
                for row in rows)
        )
        self.assertGreaterEqual(fake_model.forecast_calls[0]["horizon"], 250)
        self.assertEqual(len(fake_model.forecast_calls[0]["inputs"][0]), 32)


def _price_rows(ticker: str, close: float) -> list[dict[str, object]]:
    start = date(2025, 6, 23)
    rows = []
    for index in range(260):
        rows.append(
            {
                "ticker": ticker,
                "date": (start + timedelta(days=index)).isoformat(),
                "close": close + index * 0.1,
                "volume": 1_000_000,
            }
        )
    return rows


if __name__ == "__main__":
    unittest.main()
