from __future__ import annotations


def predict_zero_return() -> float:
    return 0.0


class BaselineReturnModel:
    def fit(self, feature_rows: object, targets: object) -> BaselineReturnModel:
        return self

    def predict(self, feature_rows: object) -> list[float]:
        try:
            row_count = len(feature_rows)  # type: ignore[arg-type]
        except TypeError:
            row_count = 1
        return [predict_zero_return()] * row_count
