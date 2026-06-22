alter table public.dashboard_model_leaderboard
add column if not exists model_type text not null default 'Classic ML';
