from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pipeline.models.baseline import BaselineReturnModel
from pipeline.models.linear import make_linear_regression
from pipeline.models.random_forest import make_random_forest

MODEL_TYPE_BASELINE = "Benchmark"
MODEL_TYPE_CLASSIC_ML = "Classic ML"
MODEL_TYPE_TIME_SERIES = "Time Series"
MODEL_TYPE_TOY_LLM = "Toy LLM"

MODEL_SLUGS: dict[str, str] = {
    "Baseline": "baseline",
    "Linear Regression": "linear-regression",
    "Ridge Regression": "ridge",
    "Lasso Regression": "lasso",
    "Random Forest": "random-forest",
    "Warren Buffbot": "warren-buffbot",
    "TimesFM": "timesfm",
    "Chronos-2": "chronos-2",
}

MODEL_TYPES: dict[str, str] = {
    "Baseline": MODEL_TYPE_BASELINE,
    "Linear Regression": MODEL_TYPE_CLASSIC_ML,
    "Random Forest": MODEL_TYPE_CLASSIC_ML,
    "Warren Buffbot": MODEL_TYPE_TOY_LLM,
    "TimesFM": MODEL_TYPE_TIME_SERIES,
    "Chronos-2": MODEL_TYPE_TIME_SERIES,
}
ACTIVE_MODEL_NAMES: tuple[str, ...] = (
    "Baseline",
    "Linear Regression",
    "Random Forest",
    "Warren Buffbot",
    "TimesFM",
    "Chronos-2",
)
HIDDEN_MODEL_SLUGS: set[str] = {"ridge", "lasso", "ridge-regression"}


@dataclass(frozen=True)
class ModelSpec:
    name: str
    slug: str
    make_model: Callable[[], Any]
    minimum_training_rows: int


MODEL_SPECS: tuple[ModelSpec, ...] = (
    ModelSpec(
        name="Baseline",
        slug=MODEL_SLUGS["Baseline"],
        make_model=BaselineReturnModel,
        minimum_training_rows=0,
    ),
    ModelSpec(
        name="Linear Regression",
        slug=MODEL_SLUGS["Linear Regression"],
        make_model=make_linear_regression,
        minimum_training_rows=100,
    ),
    ModelSpec(
        name="Random Forest",
        slug=MODEL_SLUGS["Random Forest"],
        make_model=make_random_forest,
        minimum_training_rows=100,
    ),
)
