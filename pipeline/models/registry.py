from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pipeline.models.baseline import BaselineReturnModel
from pipeline.models.linear import (
    make_lasso_regression,
    make_linear_regression,
    make_ridge_regression,
)
from pipeline.models.random_forest import make_random_forest

MODEL_SLUGS: dict[str, str] = {
    "Baseline": "baseline",
    "Linear Regression": "linear-regression",
    "Ridge Regression": "ridge",
    "Lasso Regression": "lasso",
    "Random Forest": "random-forest",
    "Warren Buffbot": "warren-buffbot",
}


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
        name="Ridge Regression",
        slug=MODEL_SLUGS["Ridge Regression"],
        make_model=make_ridge_regression,
        minimum_training_rows=100,
    ),
    ModelSpec(
        name="Lasso Regression",
        slug=MODEL_SLUGS["Lasso Regression"],
        make_model=make_lasso_regression,
        minimum_training_rows=100,
    ),
    ModelSpec(
        name="Random Forest",
        slug=MODEL_SLUGS["Random Forest"],
        make_model=make_random_forest,
        minimum_training_rows=100,
    ),
)
