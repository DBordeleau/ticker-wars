alter table public.dashboard_model_leaderboard
    add column if not exists mape double precision;

alter table public.dashboard_model_metrics
    add column if not exists mape double precision;

alter table public.dashboard_user_leaderboard
    add column if not exists mape double precision;

alter table if exists public.dashboard_user_ticker_leaderboard
    add column if not exists mape double precision;
