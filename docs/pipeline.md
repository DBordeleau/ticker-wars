# Pipeline

The Python pipeline owns ingestion, feature generation, prediction, scoring, dashboard projection
refreshes, and snapshot export.

## Command Overview

```bash
python -m pipeline.cli --help
python -m pipeline.cli backfill --start 2020-01-01
python -m pipeline.cli ingest-prices --start 2020-01-01
python -m pipeline.cli ingest-latest-prices
python -m pipeline.cli ingest-fundamentals
python -m pipeline.cli ingest-logos
python -m pipeline.cli build-features
python -m pipeline.cli predict-horizons
python -m pipeline.cli seed-model-predictions --target-start 2026-07-01 --target-end 2026-07-02
python -m pipeline.cli score
python -m pipeline.cli refresh-dashboard
python -m pipeline.cli export-snapshot
python -m pipeline.cli run-daily
python -m pipeline.cli benchmark-runtime
```

## Normal Daily Flow

`run-daily` performs the public dashboard refresh path:

1. Incrementally ingest latest daily prices.
2. Refresh fundamentals and ticker logos.
3. Build derived features as a non-writing diagnostic step.
4. Score matured model and user predictions.
5. Generate new horizon-aware model predictions.
6. Refresh dashboard projection tables.
7. Prune old fully seen engagement events.
8. Export dashboard JSON snapshots.

## Price Ingestion

`backfill` and `ingest-prices` perform explicit historical loads from a requested start date.

`ingest-latest-prices` checks the latest stored price date per ticker and fetches only missing or
recent bars. It intentionally re-fetches the most recent stored bar so late provider corrections
can be upserted.

## Feature Generation

The normal prediction paths derive bounded in-memory features directly from `prices`. The legacy
`features` table and helpers remain for compatibility and diagnostics, but durable feature writes
are not required for normal prediction generation.

## Historical Prediction Seeding

`seed-model-predictions` generates historical as-of model predictions for a target-date window.
This is useful when backfilling scored examples for the dashboard. It supports:

- `--target-start`
- `--target-end`
- `--tickers`
- `--models`
- `--dry-run`
- `--include-latest`

## Runtime Benchmarking

`benchmark-runtime` writes `data_exports/runtime_benchmark.json` with cold/warm timings,
prediction counts, approximate Python allocation/RSS data, Hugging Face cache size when available,
and an automation recommendation.

## Data Boundaries

- Browser clients should use only the Supabase URL and publishable key.
- Backend pipeline writes require secret/service credentials.
- Optional LLM and Hugging Face tokens belong only in trusted backend environments.
- Dashboard reads should prefer projection tables or exported snapshots instead of raw prediction
  tables.
