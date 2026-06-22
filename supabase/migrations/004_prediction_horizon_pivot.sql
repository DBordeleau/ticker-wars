create extension if not exists pgcrypto;

drop table if exists public.dashboard_latest_predictions cascade;
drop table if exists public.dashboard_model_leaderboard cascade;
drop table if exists public.dashboard_ticker_history cascade;
drop table if exists public.dashboard_model_metrics cascade;
drop table if exists public.dashboard_run_metadata cascade;
drop table if exists public.prediction_scores cascade;
drop table if exists public.predictions cascade;

alter table if exists public.features
    drop column if exists target_next_return,
    add column if not exists target_return_1w double precision,
    add column if not exists target_return_1m double precision,
    add column if not exists target_return_3m double precision,
    add column if not exists target_return_1y double precision,
    add column if not exists target_date_1w date,
    add column if not exists target_date_1m date,
    add column if not exists target_date_3m date,
    add column if not exists target_date_1y date,
    add column if not exists feature_version text not null default 'post_phase_7_pivot';

create table public.predictions (
    prediction_id text primary key,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    horizon_calendar_days integer not null,
    horizon_trading_days integer not null,
    model_name text not null,
    model_slug text not null,
    reference_close double precision not null,
    predicted_return double precision not null,
    predicted_close double precision not null,
    predicted_return_lower double precision,
    predicted_return_upper double precision,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    interval_level double precision not null default 0.80,
    interval_method text,
    reasoning_summary text,
    feature_version text,
    model_version text,
    model_metadata jsonb,
    created_at timestamptz not null default now(),
    constraint predictions_horizon_check check (prediction_horizon in ('1w', '1m', '3m', '1y')),
    constraint predictions_interval_level_check check (interval_level > 0 and interval_level < 1),
    constraint predictions_interval_order_check check (
        predicted_close_lower is null
        or predicted_close_upper is null
        or predicted_close_lower <= predicted_close_upper
    ),
    unique (ticker, prediction_date, target_date, prediction_horizon, model_slug)
);

create table public.prediction_scores (
    prediction_id text primary key references public.predictions(prediction_id) on delete cascade,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    model_name text not null,
    model_slug text not null,
    actual_close double precision not null,
    actual_return double precision not null,
    absolute_error double precision not null,
    squared_error double precision not null,
    absolute_pct_error double precision not null,
    predicted_direction integer not null,
    actual_direction integer not null,
    direction_correct integer not null,
    interval_hit boolean,
    interval_width double precision,
    interval_width_pct double precision,
    interval_miss_distance double precision,
    winkler_score double precision,
    scored_at timestamptz not null default now(),
    constraint prediction_scores_horizon_check check (prediction_horizon in ('1w', '1m', '3m', '1y'))
);

create table public.dashboard_latest_predictions (
    generated_at timestamptz not null,
    prediction_id text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    ticker text not null,
    model_name text not null,
    model_slug text not null,
    reference_close double precision not null,
    predicted_return double precision not null,
    predicted_close double precision not null,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    interval_level double precision,
    reasoning_summary text,
    model_metadata jsonb
);

create table public.dashboard_model_leaderboard (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    model_name text not null,
    model_slug text not null,
    mae double precision,
    directional_accuracy double precision,
    winkler_score double precision,
    scored_count integer not null,
    rank integer,
    is_toy_model boolean not null default false
);

create table public.dashboard_ticker_history (
    generated_at timestamptz not null,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    actual_close double precision,
    model_name text not null,
    model_slug text not null,
    predicted_close double precision not null,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    predicted_return double precision not null,
    actual_return double precision,
    winkler_score double precision,
    reasoning_summary text
);

create table public.dashboard_model_metrics (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    model_name text not null,
    model_slug text not null,
    mae double precision,
    directional_accuracy double precision,
    winkler_score double precision,
    scored_count integer not null
);

create table public.dashboard_run_metadata (
    generated_at timestamptz not null,
    latest_price_date date,
    latest_prediction_date date,
    ticker_count integer not null,
    model_count integer not null,
    prediction_count integer not null default 0,
    scored_count integer not null default 0,
    data_source text not null,
    last_pipeline_status text not null
);

alter table public.predictions enable row level security;
alter table public.prediction_scores enable row level security;
alter table public.dashboard_latest_predictions enable row level security;
alter table public.dashboard_model_leaderboard enable row level security;
alter table public.dashboard_ticker_history enable row level security;
alter table public.dashboard_model_metrics enable row level security;
alter table public.dashboard_run_metadata enable row level security;

create index predictions_target_date_idx on public.predictions (target_date);
create index predictions_date_horizon_idx on public.predictions (prediction_date, prediction_horizon);
create index predictions_ticker_horizon_idx on public.predictions (ticker, prediction_horizon);
create index prediction_scores_scored_at_idx on public.prediction_scores (scored_at);
create index prediction_scores_horizon_window_idx on public.prediction_scores (prediction_horizon, scored_at);

drop policy if exists "Allow public dashboard latest prediction reads" on public.dashboard_latest_predictions;
drop policy if exists "Allow public dashboard leaderboard reads" on public.dashboard_model_leaderboard;
drop policy if exists "Allow public dashboard ticker history reads" on public.dashboard_ticker_history;
drop policy if exists "Allow public dashboard model metrics reads" on public.dashboard_model_metrics;
drop policy if exists "Allow public dashboard metadata reads" on public.dashboard_run_metadata;

create policy "Allow public dashboard latest prediction reads"
on public.dashboard_latest_predictions
for select
to anon
using (true);

create policy "Allow public dashboard leaderboard reads"
on public.dashboard_model_leaderboard
for select
to anon
using (true);

create policy "Allow public dashboard ticker history reads"
on public.dashboard_ticker_history
for select
to anon
using (true);

create policy "Allow public dashboard model metrics reads"
on public.dashboard_model_metrics
for select
to anon
using (true);

create policy "Allow public dashboard metadata reads"
on public.dashboard_run_metadata
for select
to anon
using (true);
