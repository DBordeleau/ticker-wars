from __future__ import annotations

# Static MVP universe for reproducibility. Market-cap rankings change over time.
MVP_TICKERS: tuple[str, ...] = (
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "AVGO",
    "TSLA",
    "BRK-B",
    "JPM",
    "LLY",
    "V",
    "UNH",
    "XOM",
    "MA",
    "COST",
    "HD",
    "PG",
    "NFLX",
    "JNJ",
    "WMT",
    "ABBV",
    "BAC",
    "KO",
    "CRM",
    "SPY",
)


def to_yfinance_symbol(ticker: str) -> str:
    return ticker
