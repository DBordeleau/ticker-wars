from __future__ import annotations

from sklearn.ensemble import RandomForestRegressor

MODEL_NAME = "Random Forest"


def make_random_forest() -> RandomForestRegressor:
    return RandomForestRegressor(
        n_estimators=200,
        max_depth=6,
        random_state=42,
        n_jobs=-1,
    )
