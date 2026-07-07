from __future__ import annotations

import logging
from datetime import date
from typing import Any

import pandas as pd

from pipeline.config import Settings
from pipeline.features.build_features import (
    FEATURE_COLUMNS,
    TARGET_DATE_COLUMNS,
    TARGET_RETURN_COLUMNS,
)
from pipeline.forecasting.horizons import (
    FORECAST_HORIZONS,
    HORIZON_LABELS,
    ForecastHorizon,
    HorizonTarget,
    add_horizon_offset,
    count_trading_days,
    resolve_horizon_target,
)
from pipeline.llm.client import (
    LLMQuotaExceeded,
    is_llm_configured,
    request_structured_horizon_predictions,
)
from pipeline.llm.prompt_templates import (
    WARREN_BUFFBOT_PROMPT_VERSION,
    build_warren_buffbot_multi_horizon_prompt,
)
from pipeline.models.base import build_prediction_row, historical_return_interval

MODEL_NAME = "Warren Buffbot"
FUNDAMENTALS_PROMPT_FIELDS = (
    "market_cap",
    "trailing_pe",
    "forward_pe",
    "price_to_book",
    "price_to_sales",
    "revenue_ttm",
    "revenue_growth",
    "net_income_ttm",
    "profit_margin",
    "operating_margin",
    "free_cash_flow",
    "total_debt",
    "debt_to_equity",
    "current_ratio",
    "sector",
    "industry",
    "long_name",
    "short_name",
    "display_name",
    "business_summary",
)
MAX_BUSINESS_SUMMARY_CHARS = 800

LOGGER = logging.getLogger(__name__)


def generate_warren_buffbot_predictions(
    feature_rows: list[dict[str, Any]],
    price_rows: list[dict[str, Any]],
    settings: Settings,
    fundamental_rows: list[dict[str, Any]] | None = None,
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
    fundamentals_by_ticker = _fundamentals_by_ticker(fundamental_rows or [])
    predictions: list[dict[str, Any]] = []

    for ticker, ticker_features in features.groupby("ticker", sort=True):
        latest_row = ticker_features.sort_values("date").iloc[-1]
        prediction_date = pd.Timestamp(latest_row["date"]).date()
        reference_close = latest_prices.get(ticker)
        if reference_close is None:
            LOGGER.warning(
                "Warren Buffbot skipped %s because no reference close was found.",
                ticker,
            )
            continue

        feature_json = {name: float(latest_row[name]) for name in FEATURE_COLUMNS}
        fundamentals = fundamentals_by_ticker.get(ticker, {})
        targets = {
            horizon: _target_for_latest_row(latest_row, prediction_date, horizon)
            for horizon in FORECAST_HORIZONS
        }
        prompt = build_warren_buffbot_multi_horizon_prompt(
            ticker,
            reference_close,
            feature_json,
            horizon_targets={
                horizon: {
                    "label": HORIZON_LABELS[horizon],
                    "target_date": target.target_date.isoformat(),
                }
                for horizon, target in targets.items()
            },
            fundamentals=fundamentals,
        )

        try:
            horizon_responses = request_structured_horizon_predictions(
                prompt,
                FORECAST_HORIZONS,
                settings,
            )
        except LLMQuotaExceeded as exc:
            LOGGER.warning(
                "Warren Buffbot quota exhausted at %s; skipping remaining tickers: %s",
                ticker,
                exc,
            )
            break
        except Exception as exc:
            LOGGER.warning("Warren Buffbot skipped %s all horizons: %s", ticker, exc)
            continue

        for horizon in FORECAST_HORIZONS:
            target = targets[horizon]
            response = horizon_responses[horizon]
            interval = historical_return_interval(
                target_returns=[
                    float(value)
                    for value in ticker_features[TARGET_RETURN_COLUMNS[horizon]].tolist()
                    if pd.notna(value)
                ],
            )
            predictions.append(
                build_prediction_row(
                    ticker=ticker,
                    prediction_date=prediction_date,
                    target=target,
                    model_name=MODEL_NAME,
                    model_slug="warren-buffbot",
                    reference_close=reference_close,
                    predicted_return=response.predicted_return,
                    interval=interval,
                    reasoning_summary=response.reasoning_summary,
                    model_metadata={
                        "model_slug": "warren-buffbot",
                        "is_toy_model": True,
                        "provider": settings.llm_provider,
                        "prompt_version": WARREN_BUFFBOT_PROMPT_VERSION,
                        "confidence": response.confidence,
                        "prediction_horizon": horizon,
                        "fundamentals_available": bool(fundamentals),
                    },
                )
            )

    return predictions


def _feature_rows_to_frame(feature_rows: list[dict[str, Any]]) -> pd.DataFrame:
    records: list[dict[str, Any]] = []
    for row in feature_rows:
        feature_json = row.get("feature_json") or {}
        if not _has_current_feature_contract(feature_json):
            continue
        record = {
            "ticker": row["ticker"],
            "date": pd.to_datetime(row["date"]),
        }
        for horizon, column in TARGET_RETURN_COLUMNS.items():
            record[column] = row.get(column)
            record[TARGET_DATE_COLUMNS[horizon]] = row.get(TARGET_DATE_COLUMNS[horizon])
        record.update({name: float(feature_json[name]) for name in FEATURE_COLUMNS})
        records.append(record)
    return pd.DataFrame(records)


def _has_current_feature_contract(feature_json: dict[str, Any]) -> bool:
    return all(name in feature_json for name in FEATURE_COLUMNS)


def _latest_close_by_ticker(price_rows: list[dict[str, Any]]) -> dict[str, float]:
    if not price_rows:
        return {}

    prices = pd.DataFrame(price_rows)
    prices["date"] = pd.to_datetime(prices["date"])
    prices["close"] = pd.to_numeric(prices["close"], errors="coerce")
    prices = prices.dropna(subset=["ticker", "date", "close"])
    latest = prices.sort_values("date").groupby("ticker", sort=True).tail(1)
    return {row["ticker"]: float(row["close"]) for row in latest.to_dict("records")}


def _target_for_latest_row(
    latest_row: pd.Series,
    prediction_date: date,
    horizon: ForecastHorizon,
) -> HorizonTarget:
    target_date = _parse_optional_date(latest_row.get(TARGET_DATE_COLUMNS[horizon]))
    resolved = resolve_horizon_target(prediction_date, horizon)
    if target_date is None or target_date == resolved.target_date:
        return resolved

    raw_target_date = add_horizon_offset(prediction_date, horizon)
    return HorizonTarget(
        horizon=horizon,
        start_date=prediction_date,
        raw_target_date=raw_target_date,
        target_date=target_date,
        horizon_calendar_days=(target_date - prediction_date).days,
        horizon_trading_days=count_trading_days(prediction_date, target_date),
    )


def _parse_optional_date(value: object) -> date | None:
    if value is None or pd.isna(value):
        return None
    return pd.Timestamp(value).date()


def _fundamentals_by_ticker(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {
        str(row["ticker"]): curated
        for row in rows
        if row.get("ticker") and (curated := _curated_fundamentals(row))
    }


def _curated_fundamentals(row: dict[str, Any]) -> dict[str, Any]:
    curated: dict[str, Any] = {}
    for field in FUNDAMENTALS_PROMPT_FIELDS:
        value = row.get(field)
        if value is None:
            continue
        if isinstance(value, str):
            value = value.strip()
            if not value:
                continue
            if field == "business_summary":
                value = value[:MAX_BUSINESS_SUMMARY_CHARS]
        curated[field] = value
    return curated
