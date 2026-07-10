# Portfolio Notes

Use this language as a starting point for a resume, portfolio page, or project walkthrough.

## Short Resume Bullet

Built Ticker Wars, a full-stack ML forecasting dashboard that ingests market data, generates
multi-horizon stock predictions, stores predictions before outcomes mature, scores model and user
forecasts, and visualizes performance in a React/Supabase app.

## Longer Portfolio Summary

Ticker Wars is a portfolio ML/data-engineering project focused on honest forecast evaluation. The
Python pipeline ingests daily OHLCV data, derives horizon-aware features, runs baseline/classical
ML/optional foundation-model predictors, stores durable predictions, and scores them only after
target dates mature. A React dashboard presents model leaderboards, ticker-level charts, user
prediction flows, and gamified public profiles.

## Talking Points

- Designed prediction storage so every model output is auditable after the fact.
- Separated normalized pipeline tables from narrow dashboard projection tables for fast frontend
  reads.
- Implemented delayed scoring for model and user predictions across `1W`, `1M`, `3M`, and `1Y`
  horizons.
- Compared simple baselines, classical ML models, an experimental LLM prompt model, and optional
  TimesFM/Chronos adapters.
- Documented limitations clearly: unofficial data source, noisy small-sample forecasting, and no
  investment/trading claims.
