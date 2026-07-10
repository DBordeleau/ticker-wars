from __future__ import annotations

from pipeline.features.build_features import MARKET_TICKERS
from pipeline.ingestion.ticker_universe import MVP_TICKERS


def daily_price_tickers() -> tuple[str, ...]:
    return tuple(dict.fromkeys((*MVP_TICKERS, *MARKET_TICKERS)))


def daily_prediction_tickers() -> tuple[str, ...]:
    return MVP_TICKERS


def parse_ticker_arg(value: str | None) -> tuple[str, ...] | None:
    if value is None:
        return None

    tickers = tuple(
        dict.fromkeys(ticker.strip().upper() for ticker in value.split(",") if ticker.strip())
    )
    return tickers or None
