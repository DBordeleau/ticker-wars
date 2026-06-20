create extension if not exists pgcrypto;

create table if not exists public.prices (
    ticker text not null,
    date date not null,
    open double precision not null,
    high double precision not null,
    low double precision not null,
    close double precision not null,
    volume bigint not null,
    source text not null,
    ingested_at timestamptz not null default now(),
    primary key (ticker, date)
);

create table if not exists public.features (
    ticker text not null,
    date date not null,
    feature_json jsonb not null,
    target_next_return double precision,
    created_at timestamptz not null default now(),
    primary key (ticker, date)
);

create table if not exists public.predictions (
    prediction_id text primary key,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    model_name text not null,
    predicted_return double precision not null,
    predicted_close double precision not null,
    reference_close double precision not null,
    reasoning_summary text,
    model_metadata jsonb,
    created_at timestamptz not null default now(),
    unique (ticker, target_date, model_name)
);

create table if not exists public.prediction_scores (
    prediction_id text primary key references public.predictions(prediction_id) on delete cascade,
    actual_close double precision not null,
    actual_return double precision not null,
    absolute_error double precision not null,
    squared_error double precision not null,
    absolute_pct_error double precision not null,
    predicted_direction integer not null,
    actual_direction integer not null,
    direction_correct integer not null,
    scored_at timestamptz not null default now()
);

create table if not exists public.pipeline_runs (
    run_id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running',
    latest_price_date date,
    next_target_date date,
    prices_upserted integer not null default 0,
    features_upserted integer not null default 0,
    predictions_upserted integer not null default 0,
    scores_upserted integer not null default 0,
    error_message text,
    constraint pipeline_runs_status_check check (status in ('running', 'success', 'failed'))
);

create index if not exists prices_date_idx on public.prices (date);
create index if not exists features_date_idx on public.features (date);
create index if not exists predictions_target_date_idx on public.predictions (target_date);
create index if not exists prediction_scores_scored_at_idx on public.prediction_scores (scored_at);

alter table public.prices enable row level security;
alter table public.features enable row level security;
alter table public.predictions enable row level security;
alter table public.prediction_scores enable row level security;
alter table public.pipeline_runs enable row level security;
