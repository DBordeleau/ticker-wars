# Pipeline

The Python pipeline owns ingestion, feature generation, prediction, scoring, dashboard projection
refreshes, and snapshot export.

## Command Overview & Examples

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

1. Ingest latest daily prices.
2. Refresh fundamentals.
3. Score matured predictions.
4. Generate new model predictions, deriving features from the already persisted prices.
5. Build dashboard data once, then refresh projection tables and export JSON snapshots from it.
6. Prune old fully seen engagement events.

## Price Ingestion

`backfill` and `ingest-prices` perform explicit historical loads from a requested start date. These are
useful when adding new tickers.

`ingest-latest-prices` checks the latest stored price date per ticker and fetches only missing or
recent bars. It intentionally re-fetches the most recent stored bar so late provider corrections
can be upserted.

## Feature Generation

The normal prediction paths derive in-memory features directly from `prices`. Initially
I was storing these features in Supabase, but because I am relying on the free tier I wanted
to alleviate as much storage burden as possible.

`build-features` remains available as a manual diagnostic command. The daily pipeline does not
run it separately because `predict-horizons` immediately derives the same feature rows and a
standalone run would download the complete `prices` table without producing durable output.

Successful Supabase reads log the resource name, request count, row count, and approximate
serialized JSON byte count. These summaries contain no row contents or credentials and make it
possible to correlate a scheduled run with database egress.

The standalone `refresh-dashboard` and `export-snapshot` commands remain available. `run-daily`
uses a combined publish path so both outputs reuse the same in-memory dashboard tables instead of
downloading prices, predictions, and scores from Supabase twice.

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
