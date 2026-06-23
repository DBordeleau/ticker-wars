# Ticker Wars

Ticker Wars is an machine-learning and analytics project that compares stock prediction models across multiple time horizons. The pipeline ingests market data, builds horizon-specific features, stores every prediction permanently, scores matured predictions, and presents the results in a polished React dashboard.

This is not financial advice, a trading strategy, or a production prediction system. It is a portfolio project focused on clean data engineering, time-aware model evaluation, and clear frontend presentation.

## What The Dashboard Shows

- Latest stock predictions by ticker, model, and horizon.
- Prediction horizons: `1W`, `1M`, `3M`, and `1Y`.
- A model leaderboard with horizon tabs: `ALL`, `1W`, `1M`, `3M`, and `1Y`.
- Model rankings by MAE, directional accuracy, Winkler interval score, and scored count.
- Per-ticker actual vs predicted charts with optional interval bands.
- Latest prediction confidence intervals and maturity dates.
- Model detail pages, ticker detail pages, and a clearly labeled Warren Buffbot toy LLM page.

## Architecture

```text
Scheduled / manual pipeline run
        |
        v
Python pipeline
        |
        +-- Fetch OHLCV data with yfinance
        +-- Fetch/cache yfinance fundamentals when available
        +-- Build horizon-aware features
        +-- Score matured predictions
        +-- Generate new predictions for all horizons
        +-- Refresh dashboard tables
        +-- Export JSON snapshots
        |
        v
Supabase Postgres
        |
        v
React dashboard
```

The frontend reads narrow `dashboard_*` tables with a Supabase publishable key. The Python pipeline writes normalized tables with a Supabase secret key.

## Prediction Horizons

Every enabled model can write predictions for:

```text
1W | 1M | 3M | 1Y
```

Target dates are resolved with calendar offsets and rolled forward to the next available trading day. Each prediction is stored permanently in the `predictions` table and scored later when the target close is available.

## Evaluation

The leaderboard separates two ideas:

- **Horizon tabs** select what type of prediction is being evaluated, such as `1M` predictions.
- **Evaluation windows** are the matured prediction ranges used by the backend metrics, such as recent or all-time scored predictions. The current UI defaults to all available scored predictions for readability.

Displayed metrics:

- **MAE**: mean absolute error in dollars. Lower is better.
- **Directional accuracy**: how often the model predicted the correct up/down direction.
- **Winkler interval score**: evaluates confidence intervals by rewarding tight ranges that still contain the actual result. Lower is better.
- **Scored**: number of matured predictions included in the metric row.

## Models

Core models:

- Baseline: predicts no price movement.
- Linear Regression.
- Random Forest.
- Warren Buffbot: a toy LLM comparison model that can use cached fundamentals and value-investing style prompt guidance.

Optional time-series models:

- Google TimesFM.
- Amazon Chronos-2.

TimesFM and Chronos-2 are optional because they require heavier dependencies, model downloads, and runtime validation. The pipeline runs without them by default unless their feature flags and dependencies are enabled.

## Data Sources

Ticker Wars currently uses yfinance for market data and fundamentals such as valuation and company financial context when available. yfinance is useful and free, but it is unofficial and can have delays, corrections, missing fields, or occasional API issues.

No Alpha Vantage key is required for the current pipeline.

## Local Setup

Create a local environment file:

```bash
cp .env.example .env
```

Install Python dependencies:

```bash
python -m pip install -e ".[dev]"
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

For local frontend Supabase reads, create `frontend/.env.local` with:

```text
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_PUBLISHABLE_KEY=...
```

## Pipeline Commands

```bash
python -m pipeline.cli --help
python -m pipeline.cli backfill --start 2020-01-01
python -m pipeline.cli ingest-fundamentals
python -m pipeline.cli build-features
python -m pipeline.cli predict-horizons
python -m pipeline.cli score
python -m pipeline.cli refresh-dashboard
python -m pipeline.cli export-snapshot
python -m pipeline.cli run-daily
```

`run-daily` performs the normal end-to-end flow: ingest prices, ingest fundamentals, build features, score matured predictions, generate predictions, refresh dashboard tables, and export snapshots.

## Frontend

```bash
cd frontend
npm start
```

Production build:

```bash
cd frontend
npm run build
```

## Tests

Python:

```bash
pytest
```

Frontend:

```bash
cd frontend
npm test -- --watchAll=false
```

## Configuration Notes

- Put Supabase secret keys and LLM keys only in trusted backend environments.
- The React app should only receive `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_KEY`.
- `HF_TOKEN` is optional but recommended if you enable Hugging Face-hosted TimesFM/Chronos downloads to reduce rate-limit friction.
- TimesFM and Chronos dependencies are optional extras and should be installed only when you are ready to run those models locally.
