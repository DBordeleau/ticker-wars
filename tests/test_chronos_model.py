from __future__ import annotations

import unittest
from datetime import date, timedelta

import pandas as pd

from pipeline.config import Settings
from pipeline.forecasting.horizons import FORECAST_HORIZONS
from pipeline.models.chronos_model import generate_chronos_predictions


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
        self.predict_calls.append(
            {
                "context": context,
                "prediction_length": prediction_length,
                "quantile_levels": quantile_levels,
                "id_column": id_column,
                "timestamp_column": timestamp_column,
                "target": target,
                "freq": freq,
            }
        )
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


class ChronosModelTest(unittest.TestCase):
    def test_disabled_chronos_returns_no_predictions(self) -> None:
        rows = generate_chronos_predictions(
            price_rows=_price_rows("AAPL", close=100.0),
            settings=Settings(chronos_enabled=False),
            model_loader=lambda _settings: FakeChronosModel(),
        )

        self.assertEqual(rows, [])

    def test_enabled_chronos_generates_horizon_prediction_rows(self) -> None:
        fake_model = FakeChronosModel()

        rows = generate_chronos_predictions(
            price_rows=_price_rows("AAPL", close=100.0),
            settings=Settings(
                chronos_enabled=True,
                chronos_model_id="amazon/chronos-2",
                chronos_context_length=32,
            ),
            model_loader=lambda _settings: fake_model,
        )

        self.assertEqual(len(rows), 4)
        self.assertEqual({row["prediction_horizon"] for row in rows}, set(FORECAST_HORIZONS))
        self.assertTrue(all(row["model_name"] == "Chronos-2" for row in rows))
        self.assertTrue(all(row["model_slug"] == "chronos-2" for row in rows))
        self.assertTrue(all(row["interval_method"] == "chronos-2-quantiles" for row in rows))
        self.assertTrue(all(row["interval_level"] == 0.80 for row in rows))
        self.assertTrue(
            all(row["model_metadata"]["checkpoint_id"] == "amazon/chronos-2" for row in rows)
        )
        self.assertGreaterEqual(fake_model.predict_calls[0]["prediction_length"], 250)
        self.assertEqual(len(fake_model.predict_calls[0]["context"]), 32)
        self.assertEqual(fake_model.predict_calls[0]["quantile_levels"], [0.1, 0.5, 0.9])
        self.assertEqual(fake_model.predict_calls[0]["freq"], "B")


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
