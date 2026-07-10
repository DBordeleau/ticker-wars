# Database Schema

Ticker Wars uses Supabase Postgres as the contract between the Python
prediction pipeline, the React dashboard, and the authenticated user-prediction
experience.

This document is the reviewer-facing map of the schema. The public portfolio
edition uses `supabase/schema.sql` as the curated reference shape so reviewers
can understand the final design without reading every iterative migration from
the private development history.

## Design Goals

- Store durable model predictions before their target dates mature.
- Score predictions only after the realized close is available.
- Keep raw pipeline tables separate from dashboard projection tables.
- Let the browser read narrow public tables with a publishable Supabase key.
- Keep backend writes behind service-role credentials.
- Allow users to submit predictions while protecting private profiles and hidden
  prediction details.

## Data Flow

```text
yfinance market data
        |
        v
prices + fundamentals + ticker_assets
        |
        v
in-memory feature generation
        |
        v
predictions
        |
        v
prediction_scores once target closes mature
        |
        v
dashboard_* projection tables + public profile projections
        |
        v
React dashboard through Supabase publishable key
```

Live quotes use a separate compact path:

```text
Supabase Edge Function
        |
        v
live_price_snapshots + live_price_fetch_events
        |
        v
prediction reference prices and dashboard live context
```

## Core Pipeline Tables

`prices`

Daily OHLCV bars keyed by `(ticker, date)`. The ingestion step upserts recent
bars so late provider corrections can be captured.

`features`

Legacy durable feature rows keyed by `(ticker, date)`. The current normal
prediction path derives bounded in-memory features from `prices`; this table is
kept for compatibility and diagnostic workflows.

`fundamentals`

Latest yfinance fundamentals by `(ticker, as_of_date)`. Recent cleanup moved
company profile fields such as `long_name`, `business_summary`, and `website`
into explicit columns so the app does not need to keep large raw JSON payloads.

`ticker_assets`

Logo cache keyed by ticker. The pipeline and frontend currently use this table,
and the public baseline schema includes it explicitly.

`predictions`

Durable model predictions. Each row identifies:

- ticker
- prediction date
- target date
- horizon: `1w`, `1m`, `3m`, or `1y`
- model name and slug
- reference close
- predicted close/return
- optional interval bounds
- model metadata

The uniqueness contract is `(ticker, prediction_date, target_date,
prediction_horizon, model_slug)`.

`prediction_scores`

Matured model prediction scores keyed by `prediction_id`. This table stores the
actual close, absolute error, percent error, directional correctness, interval
hit/miss details, and Winkler score. It exists separately from `predictions` so
unmatured predictions remain visible before scoring.

`pipeline_runs`

Run metadata for operational observability. The dashboard mostly relies on the
projection metadata table, but this table records backend run status and counts.

## Dashboard Projection Tables

The frontend does not read raw prediction tables for its main dashboard. The
pipeline refreshes narrow projection tables instead:

- `dashboard_latest_predictions`
- `dashboard_model_leaderboard`
- `dashboard_model_metrics`
- `dashboard_ticker_history`
- `dashboard_run_metadata`
- `dashboard_user_leaderboard`
- `dashboard_user_ticker_leaderboard`
- `dashboard_latest_user_predictions`

This keeps the browser query path fast and gives the backend a stable place to
encode ranking, horizon, and retention rules.

The primary public dashboard RPC is `get_public_dashboard_bundle()`. It returns
one JSON payload containing leaderboards, latest model predictions, latest
public user predictions, model metrics, and run metadata. The frontend can also
read `ticker_assets` directly for logo data; the current bundle reserves a
ticker-assets slot for that contract.

## User Prediction Tables

`user_profiles`

Authenticated user identity, avatar settings, public/private preference, and
onboarding state. Public profile visibility is controlled by `is_public`.

`user_predictions`

User-submitted predictions keyed by UUID. Rows include the prediction horizon,
reference close, live/daily reference source, predicted close/return, privacy
setting for hiding details until scored, status, and edit metadata.

`user_prediction_revisions`

Audit trail for edits to user predictions.

`user_prediction_scores`

Scores for matured user predictions. In addition to model-like error metrics,
this table stores gamified score verdicts and XP awards.

Important user-facing RPCs:

- `submit_user_prediction(...)`
- `edit_user_prediction(...)`
- `resolve_user_prediction_reference(...)`
- `refresh_user_prediction_timing_events()`
- `mark_user_engagement_events_toast_seen(...)`
- `mark_user_engagement_events_digest_seen(...)`

## Gamification And Public Profiles

Gamification tables:

- `gamification_config`
- `user_level_thresholds`
- `badge_definitions`
- `user_progression`
- `user_badges`
- `user_xp_events`
- `user_engagement_events`
- `challenge_definitions`

Public profile projection tables:

- `public_user_profiles`
- `public_user_badges`
- `public_user_profile_predictions`
- `public_user_latest_predictions`
- `public_user_ticker_specialties`

Competition projection tables:

- `user_leaderboard_rank_snapshots`
- `dashboard_user_leaderboard_movement`
- `dashboard_user_nearby_rivals`

These tables denormalize public-safe user/profile data so profile pages,
leaderboards, nearby rivals, ticker specialties, and badge displays can be read
without exposing private user rows directly.

Important profile/competition RPCs:

- `refresh_public_user_profile(...)`
- `refresh_public_user_profiles()`
- `get_public_user_scored_predictions(...)`
- `update_user_featured_badges(...)`
- `snapshot_user_leaderboard_ranks()`
- `refresh_user_leaderboard_movement()`
- `refresh_nearby_rivals()`
- `refresh_user_ticker_specialties(...)`
- `refresh_competitive_depth()`

## Live Pricing Tables

`live_price_snapshots`

One compact current-price row per ticker. The frontend and user-prediction RPCs
use this to show live context and select the best available reference price
during market hours.

`intraday_price_bars`

Optional intraday bar cache keyed by `(ticker, ts)`.

`live_price_fetch_events`

Operational log of live quote refresh attempts. This is useful for health
checks and debugging provider failures.

The Edge Function at `supabase/functions/refresh-live-prices` updates these
tables using Supabase service credentials. Browser clients should only receive
read access to the narrow live quote tables.

## RLS And Key Boundaries

The intended boundary is:

- Browser clients use only `REACT_APP_SUPABASE_URL` and
  `REACT_APP_SUPABASE_PUBLISHABLE_KEY`.
- Public dashboard/profile/projection tables allow public reads through RLS.
- Authenticated users can read and mutate only their own private profile and
  prediction rows.
- Backend pipeline writes use `SUPABASE_SECRET_KEY` or service-role credentials.
- Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` from the Supabase environment.
- No service-role key should ever be present in frontend code or public docs.

## Publication Notes

For the public `ticker-wars` repo, `supabase/schema.sql` and this document are
the readable database story. The private migration history is valuable
operational history, but it is noisy for reviewers because it includes
backfills, privacy toggles, projection rewrites, and iterative competition
features.

Before final public packaging:

- Confirm any sample data is synthetic or sanitized.
- Confirm no Supabase service-role keys, project secrets, or real user data are
  present in the public tree.
