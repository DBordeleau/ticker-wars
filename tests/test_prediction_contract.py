from __future__ import annotations

import unittest
from datetime import date

from pipeline.forecasting.horizons import resolve_horizon_target
from pipeline.models.base import (
    PredictionInterval,
    build_prediction_row,
    compact_prediction_id,
    historical_return_interval,
    residual_prediction_interval,
)
from pipeline.models.baseline import build_baseline_prediction_row


class PredictionContractTest(unittest.TestCase):
    def test_prediction_row_has_deterministic_horizon_identity(self) -> None:
        target = resolve_horizon_target(date(2026, 6, 18), "1w")

        row = build_prediction_row(
            ticker="AAPL",
            prediction_date=date(2026, 6, 18),
            target=target,
            model_name="Baseline",
            model_slug="baseline",
            reference_close=100.0,
            predicted_return=0.02,
            created_at="2026-06-18T21:00:00+00:00",
        )

        self.assertEqual(
            row["prediction_id"],
            "117364aca52adcba1cf8c841b85c4b2e",
        )
        self.assertEqual(len(row["prediction_id"]), 32)
        int(row["prediction_id"], 16)
        self.assertEqual(row["prediction_horizon"], "1w")
        self.assertEqual(row["model_slug"], "baseline")
        self.assertEqual(row["predicted_close"], 102.0)

    def test_compact_prediction_id_is_stable_and_identity_sensitive(self) -> None:
        one_week = compact_prediction_id(
            ticker="AAPL",
            prediction_date=date(2026, 6, 18),
            target_date=date(2026, 6, 25),
            horizon="1w",
            model_slug="baseline",
        )

        self.assertEqual(one_week, "117364aca52adcba1cf8c841b85c4b2e")
        self.assertEqual(
            one_week,
            compact_prediction_id(
                ticker="AAPL",
                prediction_date="2026-06-18",
                target_date="2026-06-25",
                horizon="1w",
                model_slug="baseline",
            ),
        )
        self.assertNotEqual(
            one_week,
            compact_prediction_id(
                ticker="AAPL",
                prediction_date=date(2026, 6, 18),
                target_date=date(2026, 7, 20),
                horizon="1m",
                model_slug="baseline",
            ),
        )
        self.assertNotEqual(
            one_week,
            compact_prediction_id(
                ticker="AAPL",
                prediction_date=date(2026, 6, 18),
                target_date=date(2026, 6, 25),
                horizon="1w",
                model_slug="linear-regression",
            ),
        )

    def test_baseline_synthesis_preserves_stored_prediction_contract(self) -> None:
        target = resolve_horizon_target(date(2026, 6, 18), "1w")

        row = build_baseline_prediction_row(
            ticker="AAPL",
            prediction_date=date(2026, 6, 18),
            target=target,
            reference_close=100.0,
            interval=PredictionInterval(
                predicted_return_lower=-0.05,
                predicted_return_upper=0.10,
            ),
            created_at="2026-06-18T21:00:00+00:00",
        )

        self.assertEqual(row["model_name"], "Baseline")
        self.assertEqual(row["model_slug"], "baseline")
        self.assertEqual(row["prediction_id"], "117364aca52adcba1cf8c841b85c4b2e")
        self.assertEqual(row["predicted_return"], 0.0)
        self.assertEqual(row["predicted_close"], 100.0)
        self.assertAlmostEqual(row["predicted_close_lower"], 95.0)
        self.assertAlmostEqual(row["predicted_close_upper"], 110.0)
        self.assertEqual(
            row["model_metadata"]["baseline_prediction_source"],
            "deterministic-synthesis",
        )

    def test_prediction_row_validates_interval_order(self) -> None:
        target = resolve_horizon_target(date(2026, 6, 18), "1m")

        with self.assertRaises(ValueError):
            build_prediction_row(
                ticker="AAPL",
                prediction_date=date(2026, 6, 18),
                target=target,
                model_name="Baseline",
                model_slug="baseline",
                reference_close=100.0,
                predicted_return=0.0,
                interval=PredictionInterval(
                    predicted_return_lower=0.10,
                    predicted_return_upper=-0.10,
                ),
            )

    def test_residual_interval_centers_around_point_prediction(self) -> None:
        interval = residual_prediction_interval(
            actual_returns=[0.01, 0.02, 0.03, 0.04],
            fitted_returns=[0.00, 0.01, 0.02, 0.03],
            point_prediction=0.05,
        )

        self.assertIsNotNone(interval)
        assert interval is not None
        self.assertEqual(interval.interval_method, "residual-calibrated")
        self.assertGreater(interval.predicted_return_upper, 0.05)

    def test_historical_interval_uses_observed_horizon_returns(self) -> None:
        interval = historical_return_interval(
            target_returns=[-0.05, -0.01, 0.02, 0.08],
        )

        self.assertIsNotNone(interval)
        assert interval is not None
        self.assertEqual(interval.interval_method, "historical-horizon-return")
        self.assertLess(interval.predicted_return_lower, interval.predicted_return_upper)


if __name__ == "__main__":
    unittest.main()
