from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

import pandas as pd

from pipeline.config import Settings
from pipeline.dates import next_trading_day
from pipeline.features.build_features import FEATURE_COLUMNS
from pipeline.llm.client import is_llm_configured, request_structured_prediction
from pipeline.llm.prompt_templates import WARREN_BUFFBOT_PROMPT_VERSION, build_warren_buffbot_prompt

MODEL_NAME = "Warren Buffbot"

LOGGER = logging.getLogger(__name__)


def generate_warren_buffbot_predictions(
    feature_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
    settings: Settings,
) -> list[dict[str, Any]]:
    if not settings.warren_buffbot_enabled:
        LOGGER.info("Warren Buffbot is disabled.")
        return []

    if not is_llm_configured(settings):
        LOGGER.warning(
            "Warren Buffbot is enabled, but the selected LLM provider is not configured."
        )
        return []

    features = _feature_rows_to_frame(feature_rows)
    latest_prices = _latest_close_by_ticker(price_rows)
    predictions: list[dict[str, Any]] = []

    for ticker, ticker_features in features.groupby("ticker", sort=True):
        latest_row = ticker_features.sort_values("date").iloc[-1]
        prediction_date = pd.Timestamp(latest_row["date"]).date()
        target_date = next_trading_day(prediction_date)
        reference_close = latest_prices.get(ticker)
        if reference_close is None:
            LOGGER.warning(
                "Warren Buffbot skipped %s because no reference close was found.",
                ticker,
            )
            continue

        feature_json = {name: float(latest_row[name]) for name in FEATURE_COLUMNS}
        prompt = build_warren_buffbot_prompt(ticker, reference_close, feature_json)

        try:
            response = request_structured_prediction(prompt, settings)
        except Exception as exc:
            LOGGER.warning("Warren Buffbot skipped %s: %s", ticker, exc)
            continue

        predictions.append(
            {
                "prediction_id": f"{ticker}:{target_date.isoformat()}:warren-buffbot",
                "ticker": ticker,
                "prediction_date": prediction_date.isoformat(),
                "target_date": target_date.isoformat(),
                "model_name": MODEL_NAME,
                "predicted_return": response.predicted_return,
                "predicted_close": reference_close * (1 + response.predicted_return),
                "reference_close": reference_close,
                "reasoning_summary": response.reasoning_summary,
                "model_metadata": {
                    "model_slug": "warren-buffbot",
                    "is_toy_model": True,
                    "provider": settings.llm_provider,
                    "prompt_version": WARREN_BUFFBOT_PROMPT_VERSION,
                    "confidence": response.confidence,
                },
                "created_at": datetime.now(UTC).isoformat(),
            }
        )

    return predictions


def _feature_rows_to_frame(feature_rows: list[dict[str, Any]]) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    for row in feature_rows:
        feature_json = row.get("feature_json") or {}
        record = {
            "ticker": row["ticker"],
            "date": pd.to_datetime(row["date"]),
        }
        record.update({name: float(feature_json[name]) for name in FEATURE_COLUMNS})
        records.append(record)
    return pd.DataFrame(records)


def _latest_close_by_ticker(price_rows: list[dict[str, Any]]) -> dict[str, float]:
    if not price_rows:
        return {}

    prices = pd.DataFrame(price_rows)
    prices["date"] = pd.to_datetime(prices["date"])
    prices["close"] = pd.to_numeric(prices["close"], errors="coerce")
    prices = prices.dropna(subset=["ticker", "date", "close"])
    latest = prices.sort_values("date").groupby("ticker", sort=True).tail(1)
    return {row["ticker"]: float(row["close"]) for row in latest.to_dict("records")}
