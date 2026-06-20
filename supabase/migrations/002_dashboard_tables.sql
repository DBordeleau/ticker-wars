create table if not exists public.dashboard_latest_predictions (
    generated_at timestamptz not null,
    target_date date not null,
    ticker text not null,
    model_name text not null,
    model_slug text not null,
    reference_close double precision not null,
    predicted_return double precision not null,
    predicted_close double precision not null,
    reasoning_summary text,
    model_metadata jsonb
);

create table if not exists public.dashboard_model_leaderboard (
    generated_at timestamptz not null,
    "window" text not null,
    model_name text not null,
    model_slug text not null,
    mae double precision,
    rmse double precision,
    mape double precision,
    directional_accuracy double precision,
    prediction_count integer not null,
    rank integer,
    is_toy_model boolean not null default false
);

create table if not exists public.dashboard_ticker_history (
    generated_at timestamptz not null,
    ticker text not null,
    date date not null,
    actual_close double precision,
    model_name text not null,
    model_slug text not null,
    predicted_close double precision not null,
    predicted_return double precision not null,
    actual_return double precision,
    reasoning_summary text
);

create table if not exists public.dashboard_run_metadata (
    generated_at timestamptz not null,
    latest_price_date date,
    next_target_date date,
    ticker_count integer not null,
    model_count integer not null,
    data_source text not null,
    last_pipeline_status text not null
);

alter table public.dashboard_latest_predictions enable row level security;
alter table public.dashboard_model_leaderboard enable row level security;
alter table public.dashboard_ticker_history enable row level security;
alter table public.dashboard_run_metadata enable row level security;

drop policy if exists "Allow public dashboard latest prediction reads"
on public.dashboard_latest_predictions;

drop policy if exists "Allow public dashboard leaderboard reads"
on public.dashboard_model_leaderboard;

drop policy if exists "Allow public dashboard ticker history reads"
on public.dashboard_ticker_history;

drop policy if exists "Allow public dashboard metadata reads"
on public.dashboard_run_metadata;

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

create policy "Allow public dashboard metadata reads"
on public.dashboard_run_metadata
for select
to anon
using (true);
