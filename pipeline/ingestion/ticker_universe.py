from __future__ import annotations

# Static MVP universe for reproducibility. Market-cap rankings change over time.
MVP_TICKERS = (
    # Big Tech / AI
    "AAPL",
    "MSFT",
    "NVDA",
    "AMZN",
    "GOOGL",
    "META",
    "AVGO",
    "TSLA",
    "AMD",
    "TSM",
    "ARM",
    "ORCL",
    "INTC",
    "SMCI",
    "IBM",
    "CRWD",

    # Financials
    "BRK-B",
    "JPM",
    "BAC",
    "V",
    "MA",
    "HOOD",
    "SOFI",

    # Consumer
    "WMT",
    "COST",
    "NFLX",
    "DIS",
    "NKE",
    "UBER",
    "HIMS",
    "CAVA",

    # Healthcare
    "LLY",
    "ABBV",

    # Energy
    "XOM",

    # Software / Enterprise
    "CRM",

    # ETFs
    "SPY",

    # Meme / Internet
    "GME",
    "AMC",
    "RDDT",

    # Space
    "RKLB",
    "ASTS",
    "LUNR",

    # EV
    "RIVN",
    "LCID",

    # Crypto
    "COIN",
    "MSTR",

    # Growth
    "PLTR",
    "MU",

    # Interesting Stories
    "OKLO",
    "APP",
)


def to_yfinance_symbol(ticker: str) -> str:
    return ticker
