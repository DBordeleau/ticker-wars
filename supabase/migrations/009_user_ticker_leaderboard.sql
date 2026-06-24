create table if not exists public.dashboard_user_ticker_leaderboard (
    generated_at timestamptz not null,
    ticker text not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    mae double precision,
    directional_accuracy double precision,
    scored_count integer not null,
    rank integer
);

alter table public.dashboard_user_ticker_leaderboard enable row level security;

create policy "Allow public dashboard user ticker leaderboard reads"
on public.dashboard_user_ticker_leaderboard
for select
to anon, authenticated
using (true);

create or replace function public.remove_private_user_dashboard_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.is_public = false and old.is_public is distinct from new.is_public then
        delete from public.dashboard_user_leaderboard
        where user_id = new.user_id;

        delete from public.dashboard_user_ticker_leaderboard
        where user_id = new.user_id;

        delete from public.dashboard_latest_user_predictions
        where user_id = new.user_id;
    end if;

    return new;
end;
$$;
