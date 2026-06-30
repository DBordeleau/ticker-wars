from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UserScoreVerdict:
    slug: str
    label: str
    rank: int
    color: str
    bonus_xp: int


VERDICTS: tuple[UserScoreVerdict, ...] = (
    UserScoreVerdict("called_it", "Called it", 1, "yellow", 250),
    UserScoreVerdict("close_call", "Close call", 2, "green", 150),
    UserScoreVerdict("in_the_zone", "In the zone", 3, "green", 80),
    UserScoreVerdict("miss", "Miss", 4, "orange", 25),
    UserScoreVerdict("way_off", "Way off", 5, "orange", 5),
    UserScoreVerdict("not_even_close", "Not even close", 6, "red", 0),
)

VERDICTS_BY_RANK = {verdict.rank: verdict for verdict in VERDICTS}

VERDICT_THRESHOLDS_BY_HORIZON: dict[str, tuple[float | None, ...]] = {
    "1w": (0.005, 0.015, 0.03, 0.06, 0.12, None),
    "1m": (0.0075, 0.025, 0.05, 0.09, 0.18, None),
    "3m": (0.01, 0.03, 0.06, 0.12, 0.24, None),
    "1y": (0.015, 0.04, 0.08, 0.16, 0.32, None),
}

HORIZON_MULTIPLIERS = {
    "1w": 1.0,
    "1m": 1.35,
    "3m": 2.0,
    "1y": 3.0,
}

SCORED_BASE_XP = 25
DIRECTION_HIT_XP = 20


def score_verdict(
    absolute_pct_error: float,
    direction_correct: int = 1,
    prediction_horizon: str = "1m",
) -> UserScoreVerdict:
    thresholds = VERDICT_THRESHOLDS_BY_HORIZON.get(
        prediction_horizon,
        VERDICT_THRESHOLDS_BY_HORIZON["1m"],
    )
    base_rank = len(VERDICTS)

    for index, max_error in enumerate(thresholds, start=1):
        if max_error is None or absolute_pct_error <= max_error:
            base_rank = index
            break

    if direction_correct != 1:
        base_rank = min(len(VERDICTS), base_rank + 1)
        if prediction_horizon == "1w":
            base_rank = max(base_rank, 4)

    return VERDICTS_BY_RANK.get(base_rank, VERDICTS[-1])


def scored_prediction_xp(
    *,
    absolute_pct_error: float,
    direction_correct: int,
    prediction_horizon: str,
) -> int:
    verdict = score_verdict(
        absolute_pct_error,
        direction_correct=direction_correct,
        prediction_horizon=prediction_horizon,
    )
    direction_bonus = DIRECTION_HIT_XP if direction_correct == 1 else 0
    multiplier = HORIZON_MULTIPLIERS.get(prediction_horizon, 1.0)
    return round((SCORED_BASE_XP + direction_bonus + verdict.bonus_xp) * multiplier)


def score_verdict_fields(
    *,
    absolute_pct_error: float,
    direction_correct: int,
    prediction_horizon: str,
) -> dict[str, int | str]:
    verdict = score_verdict(
        absolute_pct_error,
        direction_correct=direction_correct,
        prediction_horizon=prediction_horizon,
    )
    return {
        "score_verdict": verdict.slug,
        "score_verdict_rank": verdict.rank,
        "score_verdict_color": verdict.color,
        "xp_awarded": scored_prediction_xp(
            absolute_pct_error=absolute_pct_error,
            direction_correct=direction_correct,
            prediction_horizon=prediction_horizon,
        ),
    }
