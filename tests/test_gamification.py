from __future__ import annotations

import unittest

from pipeline.evaluation.user_verdicts import score_verdict, scored_prediction_xp


class UserGamificationTest(unittest.TestCase):
    def test_score_verdict_boundaries(self) -> None:
        self.assertEqual(score_verdict(0.01).slug, "called_it")
        self.assertEqual(score_verdict(0.0301).slug, "in_the_zone")
        self.assertEqual(score_verdict(0.20).slug, "way_off")
        self.assertEqual(score_verdict(0.2001).slug, "not_even_close")

    def test_scored_prediction_xp_uses_direction_and_horizon(self) -> None:
        self.assertEqual(
            scored_prediction_xp(
                absolute_pct_error=0.009,
                direction_correct=1,
                prediction_horizon="1w",
            ),
            295,
        )
        self.assertEqual(
            scored_prediction_xp(
                absolute_pct_error=0.025,
                direction_correct=1,
                prediction_horizon="1y",
            ),
            585,
        )
        self.assertEqual(
            scored_prediction_xp(
                absolute_pct_error=0.10,
                direction_correct=0,
                prediction_horizon="3m",
            ),
            100,
        )


if __name__ == "__main__":
    unittest.main()
