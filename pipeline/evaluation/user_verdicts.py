from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class UserScoreVerdict:
    slug: str
    label: str
    rank: int
    color: str
    max_absolute_pct_error: float | None
    bonus_xp: int


VERDICTS: tuple[UserScoreVerdict, ...] = (
    UserScoreVerdict("called_it", "Called it", 1, "yellow", 0.01, 250),
    UserScoreVerdict("close_call", "Close call", 2, "green", 0.03, 150),
    UserScoreVerdict("in_the_zone", "In the zone", 3, "teal", 0.06, 80),
    UserScoreVerdict("miss", "Miss", 4, "yellow", 0.10, 25),
    UserScoreVerdict("way_off", "Way off", 5, "orange", 0.20, 5),
    UserScoreVerdict("not_even_close", "Not even close", 6, "red", None, 0),
)

HORIZON_MULTIPLIERS = {
    "1w": 1.0,
    "1m": 1.35,
    "3m": 2.0,
    "1y": 3.0,
}

SCORED_BASE_XP = 25
DIRECTION_HIT_XP = 20


def score_verdict(absolute_pct_error: float) -> UserScoreVerdict:
    for verdict in VERDICTS:
        if verdict.max_absolute_pct_error is None:
            return verdict
        if absolute_pct_error <= verdict.max_absolute_pct_error:
            return verdict

    return VERDICTS[-1]


def scored_prediction_xp(
    *,
    absolute_pct_error: float,
    direction_correct: int,
    prediction_horizon: str,
) -> int:
    verdict = score_verdict(absolute_pct_error)
    direction_bonus = DIRECTION_HIT_XP if direction_correct == 1 else 0
    multiplier = HORIZON_MULTIPLIERS.get(prediction_horizon, 1.0)
    return round((SCORED_BASE_XP + direction_bonus + verdict.bonus_xp) * multiplier)


def score_verdict_fields(
    *,
    absolute_pct_error: float,
    direction_correct: int,
    prediction_horizon: str,
) -> dict[str, int | str]:
    verdict = score_verdict(absolute_pct_error)
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
