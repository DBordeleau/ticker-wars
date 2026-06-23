create extension if not exists pgcrypto;
create extension if not exists citext;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create table public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username citext not null unique,
    display_username text not null,
    is_public boolean not null default true,
    avatar_style text not null default 'adventurer-neutral',
    avatar_seed text not null,
    avatar_options jsonb not null default '{}'::jsonb,
    note text,
    note_moderation_status text not null default 'unreviewed',
    onboarding_completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_profiles_username_format_check check (
        display_username ~ '^[A-Za-z0-9_-]{3,24}$'
    ),
    constraint user_profiles_username_normalized_check check (
        username = lower(display_username)::citext
    ),
    constraint user_profiles_avatar_style_check check (
        avatar_style = 'adventurer-neutral'
    ),
    constraint user_profiles_note_length_check check (
        note is null or char_length(note) <= 240
    ),
    constraint user_profiles_note_moderation_status_check check (
        note_moderation_status in ('unreviewed', 'approved', 'rejected')
    )
);

create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

create table public.user_predictions (
    prediction_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    horizon_calendar_days integer not null,
    reference_close double precision not null,
    predicted_close double precision not null,
    predicted_return double precision not null,
    status text not null default 'pending',
    edit_count integer not null default 0,
    last_edited_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_predictions_ticker_upper_check check (ticker = upper(ticker)),
    constraint user_predictions_horizon_check check (
        prediction_horizon in ('1w', '1m', '3m', '1y')
    ),
    constraint user_predictions_status_check check (
        status in ('pending', 'scored', 'cancelled')
    ),
    constraint user_predictions_reference_close_check check (reference_close > 0),
    constraint user_predictions_predicted_close_check check (predicted_close > 0),
    constraint user_predictions_date_order_check check (target_date > prediction_date)
);

create trigger set_user_predictions_updated_at
before update on public.user_predictions
for each row
execute function public.set_updated_at();

create unique index user_predictions_one_pending_ticker_horizon_idx
on public.user_predictions (user_id, ticker, prediction_horizon)
where status = 'pending';

create index user_predictions_user_date_idx
on public.user_predictions (user_id, prediction_date desc);

create index user_predictions_target_status_idx
on public.user_predictions (target_date, status);

create index user_predictions_ticker_target_idx
on public.user_predictions (ticker, target_date);

create table public.user_prediction_revisions (
    revision_id uuid primary key default gen_random_uuid(),
    prediction_id uuid not null references public.user_predictions(prediction_id) on delete cascade,
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    revision_number integer not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    reference_close double precision not null,
    predicted_close double precision not null,
    predicted_return double precision not null,
    created_at timestamptz not null default now(),
    constraint user_prediction_revisions_horizon_check check (
        prediction_horizon in ('1w', '1m', '3m', '1y')
    ),
    constraint user_prediction_revisions_unique_number unique (
        prediction_id,
        revision_number
    )
);

create index user_prediction_revisions_user_idx
on public.user_prediction_revisions (user_id, created_at desc);

create table public.user_prediction_scores (
    prediction_id uuid primary key references public.user_predictions(prediction_id) on delete cascade,
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    actual_close double precision not null,
    actual_return double precision not null,
    absolute_error double precision not null,
    squared_error double precision not null,
    absolute_pct_error double precision not null,
    predicted_direction integer not null,
    actual_direction integer not null,
    direction_correct integer not null,
    scored_at timestamptz not null default now(),
    constraint user_prediction_scores_horizon_check check (
        prediction_horizon in ('1w', '1m', '3m', '1y')
    )
);

create index user_prediction_scores_user_idx
on public.user_prediction_scores (user_id, scored_at desc);

create index user_prediction_scores_horizon_window_idx
on public.user_prediction_scores (prediction_horizon, scored_at);

create table public.dashboard_user_leaderboard (
    generated_at timestamptz not null,
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

create table public.dashboard_latest_user_predictions (
    generated_at timestamptz not null,
    prediction_id uuid not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    ticker text not null,
    reference_close double precision not null,
    predicted_return double precision not null,
    predicted_close double precision not null
);

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

        delete from public.dashboard_latest_user_predictions
        where user_id = new.user_id;
    end if;

    return new;
end;
$$;

create trigger remove_private_user_dashboard_rows
after update of is_public on public.user_profiles
for each row
execute function public.remove_private_user_dashboard_rows();

alter table public.user_profiles enable row level security;
alter table public.user_predictions enable row level security;
alter table public.user_prediction_revisions enable row level security;
alter table public.user_prediction_scores enable row level security;
alter table public.dashboard_user_leaderboard enable row level security;
alter table public.dashboard_latest_user_predictions enable row level security;

create policy "Allow public profile reads"
on public.user_profiles
for select
to anon, authenticated
using (is_public or user_id = auth.uid());

create policy "Allow users to insert their profile"
on public.user_profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Allow users to update their profile"
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Allow users to read their predictions"
on public.user_predictions
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow users to insert their predictions"
on public.user_predictions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Allow users to update editable predictions"
on public.user_predictions
for update
to authenticated
using (
    user_id = auth.uid()
    and status = 'pending'
    and current_date < target_date - 7
)
with check (
    user_id = auth.uid()
    and status = 'pending'
    and current_date < target_date - 7
);

create policy "Allow users to read their prediction revisions"
on public.user_prediction_revisions
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow users to read their prediction scores"
on public.user_prediction_scores
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow public dashboard user leaderboard reads"
on public.dashboard_user_leaderboard
for select
to anon, authenticated
using (true);

create policy "Allow public dashboard latest user prediction reads"
on public.dashboard_latest_user_predictions
for select
to anon, authenticated
using (true);
