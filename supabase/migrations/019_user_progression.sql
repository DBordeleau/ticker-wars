create table if not exists public.gamification_config (
    key text primary key,
    value jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.gamification_config (key, value)
values ('phase1', jsonb_build_object('launched_at', now()))
on conflict (key) do nothing;

create table if not exists public.user_level_thresholds (
    level integer primary key,
    total_xp integer not null unique,
    constraint user_level_thresholds_level_check check (level >= 1),
    constraint user_level_thresholds_total_xp_check check (total_xp >= 0)
);

insert into public.user_level_thresholds (level, total_xp)
values
    (1, 0),
    (2, 100),
    (3, 260),
    (4, 500),
    (5, 850),
    (6, 1300),
    (7, 1850),
    (8, 2500),
    (9, 3250),
    (10, 4000),
    (11, 5000),
    (12, 6200),
    (13, 7600),
    (14, 9200),
    (15, 11000),
    (16, 12500),
    (17, 14000),
    (18, 15500),
    (19, 17000),
    (20, 18000),
    (21, 20500),
    (22, 23200),
    (23, 26200),
    (24, 29500),
    (25, 33000),
    (26, 36000),
    (27, 39000),
    (28, 42000),
    (29, 43500),
    (30, 45000),
    (31, 50000),
    (32, 55500),
    (33, 61500),
    (34, 68000),
    (35, 75000),
    (36, 82000),
    (37, 89500),
    (38, 97500),
    (39, 106000),
    (40, 115000),
    (41, 120000),
    (42, 123000),
    (43, 126000),
    (44, 129000),
    (45, 132000),
    (46, 134000),
    (47, 136000),
    (48, 138000),
    (49, 139000),
    (50, 140000)
on conflict (level) do update set total_xp = excluded.total_xp;

create table if not exists public.badge_definitions (
    slug text primary key,
    name text not null,
    description text not null,
    family text not null,
    rarity text not null,
    icon_name text not null,
    title_unlock text,
    criteria jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    constraint badge_definitions_rarity_check check (
        rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')
    )
);

insert into public.badge_definitions (
    slug,
    name,
    description,
    family,
    rarity,
    icon_name,
    title_unlock,
    criteria,
    sort_order
)
values
    (
        'first_call',
        'First Call',
        'Make your first prediction after progression launches.',
        'exploration',
        'common',
        'target',
        'Rookie Forecaster',
        '{"type":"prediction_submitted","count":1}'::jsonb,
        10
    ),
    (
        'called_it_once',
        'Called It',
        'Earn a Called it verdict on a scored prediction.',
        'accuracy',
        'uncommon',
        'crosshair',
        'Close Caller',
        '{"type":"score_verdict","verdict":"called_it","count":1}'::jsonb,
        20
    ),
    (
        'close_caller',
        'Close Caller',
        'Earn five Close call or better verdicts.',
        'accuracy',
        'rare',
        'bullseye',
        'Close Caller',
        '{"type":"score_verdict_any","verdicts":["called_it","close_call"],"count":5}'::jsonb,
        30
    ),
    (
        'full_board',
        'Full Board',
        'Hold active predictions across all four horizons at once.',
        'exploration',
        'uncommon',
        'grid',
        'Market Scout',
        '{"type":"active_horizons","count":4}'::jsonb,
        40
    ),
    (
        'long_view',
        'Long View',
        'Score a one-year prediction.',
        'long_horizon',
        'rare',
        'telescope',
        'Long View Analyst',
        '{"type":"scored_horizon","horizon":"1y","count":1}'::jsonb,
        50
    ),
    (
        'ticker_tour',
        'Ticker Tour',
        'Make predictions on ten different tickers.',
        'exploration',
        'uncommon',
        'map',
        'Market Scout',
        '{"type":"distinct_tickers","count":10}'::jsonb,
        60
    ),
    (
        'on_the_board',
        'On the Board',
        'Appear on a public user leaderboard.',
        'competition',
        'uncommon',
        'list',
        'Ranked Forecaster',
        '{"type":"leaderboard_presence","public_required":true}'::jsonb,
        70
    ),
    (
        'podium_finish',
        'Podium Finish',
        'Finish in the top three of a public leaderboard.',
        'competition',
        'rare',
        'award',
        'Podium Finisher',
        '{"type":"leaderboard_rank","max_rank":3,"public_required":true}'::jsonb,
        80
    ),
    (
        'champion',
        'Champion',
        'Finish first on a public leaderboard.',
        'competition',
        'epic',
        'crown',
        'Champion',
        '{"type":"leaderboard_rank","max_rank":1,"public_required":true}'::jsonb,
        90
    ),
    (
        'warm_hand',
        'Warm Hand',
        'Hit the correct direction on three newly scored predictions in a row.',
        'consistency',
        'uncommon',
        'trending-up',
        'Direction Hunter',
        '{"type":"direction_streak","count":3}'::jsonb,
        100
    )
on conflict (slug) do update set
    name = excluded.name,
    description = excluded.description,
    family = excluded.family,
    rarity = excluded.rarity,
    icon_name = excluded.icon_name,
    title_unlock = excluded.title_unlock,
    criteria = excluded.criteria,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

create table if not exists public.user_progression (
    user_id uuid primary key references public.user_profiles(user_id) on delete cascade,
    total_xp integer not null default 0,
    level integer not null default 1,
    featured_badge_slug text references public.badge_definitions(slug),
    equipped_title text,
    last_event_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint user_progression_total_xp_check check (total_xp >= 0),
    constraint user_progression_level_check check (level >= 1)
);

create trigger set_user_progression_updated_at
before update on public.user_progression
for each row
execute function public.set_updated_at();

create table if not exists public.user_xp_events (
    event_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    event_type text not null,
    xp_amount integer not null,
    source_prediction_id uuid references public.user_predictions(prediction_id) on delete set null,
    source_badge_slug text references public.badge_definitions(slug),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    constraint user_xp_events_xp_amount_check check (xp_amount >= 0),
    constraint user_xp_events_event_type_check check (
        event_type in (
            'prediction_submitted',
            'prediction_scored',
            'badge_unlocked',
            'level_reached'
        )
    )
);

create unique index if not exists user_xp_events_one_submission_per_prediction_idx
on public.user_xp_events (source_prediction_id, event_type)
where event_type = 'prediction_submitted' and source_prediction_id is not null;

create unique index if not exists user_xp_events_one_score_per_prediction_idx
on public.user_xp_events (source_prediction_id, event_type)
where event_type = 'prediction_scored' and source_prediction_id is not null;

create unique index if not exists user_xp_events_one_badge_per_user_idx
on public.user_xp_events (user_id, source_badge_slug, event_type)
where event_type = 'badge_unlocked' and source_badge_slug is not null;

create index if not exists user_xp_events_user_created_idx
on public.user_xp_events (user_id, created_at desc);

create table if not exists public.user_badges (
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    badge_slug text not null references public.badge_definitions(slug),
    unlocked_at timestamptz not null default now(),
    source_prediction_id uuid references public.user_predictions(prediction_id) on delete set null,
    source_event_id uuid references public.user_xp_events(event_id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    primary key (user_id, badge_slug)
);

create index if not exists user_badges_user_unlocked_idx
on public.user_badges (user_id, unlocked_at desc);

create table if not exists public.user_engagement_events (
    event_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    event_type text not null,
    headline text not null,
    body text,
    source_prediction_id uuid references public.user_predictions(prediction_id) on delete set null,
    source_badge_slug text references public.badge_definitions(slug),
    xp_amount integer,
    metadata jsonb not null default '{}'::jsonb,
    seen_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists user_engagement_events_user_unseen_idx
on public.user_engagement_events (user_id, seen_at, created_at desc);

alter table public.user_prediction_scores
add column if not exists score_verdict text,
add column if not exists score_verdict_rank integer,
add column if not exists score_verdict_color text,
add column if not exists xp_awarded integer not null default 0;

alter table public.user_prediction_scores
drop constraint if exists user_prediction_scores_score_verdict_check,
add constraint user_prediction_scores_score_verdict_check check (
    score_verdict is null
    or score_verdict in (
        'called_it',
        'close_call',
        'in_the_zone',
        'miss',
        'way_off',
        'not_even_close'
    )
);

alter table public.user_prediction_scores
drop constraint if exists user_prediction_scores_score_verdict_rank_check,
add constraint user_prediction_scores_score_verdict_rank_check check (
    score_verdict_rank is null or score_verdict_rank between 1 and 6
);

alter table public.user_prediction_scores
drop constraint if exists user_prediction_scores_xp_awarded_check,
add constraint user_prediction_scores_xp_awarded_check check (xp_awarded >= 0);

alter table public.gamification_config enable row level security;
alter table public.user_level_thresholds enable row level security;
alter table public.badge_definitions enable row level security;
alter table public.user_progression enable row level security;
alter table public.user_xp_events enable row level security;
alter table public.user_badges enable row level security;
alter table public.user_engagement_events enable row level security;

create policy "Allow public gamification config reads"
on public.gamification_config
for select
to anon, authenticated
using (true);

create policy "Allow public level threshold reads"
on public.user_level_thresholds
for select
to anon, authenticated
using (true);

create policy "Allow public badge definition reads"
on public.badge_definitions
for select
to anon, authenticated
using (is_active);

create policy "Allow users to read their progression"
on public.user_progression
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow users to read their XP events"
on public.user_xp_events
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow users to read their badges"
on public.user_badges
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow users to read their engagement events"
on public.user_engagement_events
for select
to authenticated
using (user_id = auth.uid());

create policy "Allow users to mark their engagement events seen"
on public.user_engagement_events
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.gamification_launched_at()
returns timestamptz
language sql
stable
set search_path = public
as $$
    select coalesce(
        (value ->> 'launched_at')::timestamptz,
        'infinity'::timestamptz
    )
    from public.gamification_config
    where key = 'phase1'
$$;

create or replace function public.calculate_user_level(p_total_xp integer)
returns integer
language sql
stable
set search_path = public
as $$
    select coalesce(max(level), 1)
    from public.user_level_thresholds
    where total_xp <= greatest(p_total_xp, 0)
$$;

create or replace function public.badge_xp_amount(p_badge_slug text)
returns integer
language sql
stable
set search_path = public
as $$
    select case rarity
        when 'common' then 25
        when 'uncommon' then 50
        when 'rare' then 100
        when 'epic' then 150
        when 'legendary' then 200
        else 25
    end
    from public.badge_definitions
    where slug = p_badge_slug
$$;

create or replace function public.grant_user_xp(
    p_user_id uuid,
    p_event_type text,
    p_xp_amount integer,
    p_source_prediction_id uuid,
    p_source_badge_slug text,
    p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_event_id uuid;
    previous_level integer;
    next_level integer;
    next_total_xp integer;
begin
    if p_user_id is null or p_xp_amount < 0 then
        return null;
    end if;

    insert into public.user_progression (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

    select level
    into previous_level
    from public.user_progression
    where user_id = p_user_id;

    insert into public.user_xp_events (
        user_id,
        event_type,
        xp_amount,
        source_prediction_id,
        source_badge_slug,
        metadata
    )
    values (
        p_user_id,
        p_event_type,
        p_xp_amount,
        p_source_prediction_id,
        p_source_badge_slug,
        coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict do nothing
    returning event_id into inserted_event_id;

    if inserted_event_id is null then
        return null;
    end if;

    update public.user_progression
    set
        total_xp = total_xp + p_xp_amount,
        level = public.calculate_user_level(total_xp + p_xp_amount),
        last_event_at = now()
    where user_id = p_user_id
    returning total_xp, level into next_total_xp, next_level;

    if next_level > coalesce(previous_level, 1) then
        insert into public.user_engagement_events (
            user_id,
            event_type,
            headline,
            body,
            xp_amount,
            metadata
        )
        values (
            p_user_id,
            'level_reached',
            'Level ' || next_level || ' reached',
            'Your forecasting profile reached Level ' || next_level || '.',
            0,
            jsonb_build_object(
                'previous_level', previous_level,
                'level', next_level,
                'total_xp', next_total_xp
            )
        );
    end if;

    return inserted_event_id;
end;
$$;

create or replace function public.grant_user_badge(
    p_user_id uuid,
    p_badge_slug text,
    p_source_prediction_id uuid,
    p_metadata jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_badge_slug text;
    definition public.badge_definitions%rowtype;
    badge_event_id uuid;
    badge_xp integer;
begin
    select *
    into definition
    from public.badge_definitions
    where slug = p_badge_slug
      and is_active;

    if not found then
        return false;
    end if;

    insert into public.user_badges (
        user_id,
        badge_slug,
        source_prediction_id,
        metadata
    )
    values (
        p_user_id,
        p_badge_slug,
        p_source_prediction_id,
        coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict do nothing
    returning badge_slug into inserted_badge_slug;

    if inserted_badge_slug is null then
        return false;
    end if;

    badge_xp := coalesce(public.badge_xp_amount(p_badge_slug), 25);
    badge_event_id := public.grant_user_xp(
        p_user_id,
        'badge_unlocked',
        badge_xp,
        p_source_prediction_id,
        p_badge_slug,
        jsonb_build_object('badge_slug', p_badge_slug, 'rarity', definition.rarity)
    );

    update public.user_badges
    set source_event_id = badge_event_id
    where user_id = p_user_id
      and badge_slug = p_badge_slug;

    insert into public.user_engagement_events (
        user_id,
        event_type,
        headline,
        body,
        source_prediction_id,
        source_badge_slug,
        xp_amount,
        metadata
    )
    values (
        p_user_id,
        'badge_unlocked',
        definition.name || ' unlocked',
        definition.description,
        p_source_prediction_id,
        p_badge_slug,
        badge_xp,
        jsonb_build_object(
            'badge_slug', p_badge_slug,
            'name', definition.name,
            'rarity', definition.rarity,
            'title_unlock', definition.title_unlock
        )
    );

    update public.user_progression
    set
        featured_badge_slug = coalesce(featured_badge_slug, p_badge_slug),
        equipped_title = coalesce(equipped_title, definition.title_unlock)
    where user_id = p_user_id;

    return true;
end;
$$;

create or replace function public.evaluate_submission_badges(
    p_user_id uuid,
    p_prediction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    launch_ts timestamptz := public.gamification_launched_at();
    active_horizons integer;
    distinct_tickers integer;
begin
    perform public.grant_user_badge(
        p_user_id,
        'first_call',
        p_prediction_id,
        '{"trigger":"prediction_submitted"}'::jsonb
    );

    select count(distinct prediction_horizon)
    into active_horizons
    from public.user_predictions
    where user_id = p_user_id
      and status = 'pending'
      and created_at >= launch_ts;

    if active_horizons >= 4 then
        perform public.grant_user_badge(
            p_user_id,
            'full_board',
            p_prediction_id,
            jsonb_build_object('active_horizons', active_horizons)
        );
    end if;

    select count(distinct ticker)
    into distinct_tickers
    from public.user_predictions
    where user_id = p_user_id
      and created_at >= launch_ts;

    if distinct_tickers >= 10 then
        perform public.grant_user_badge(
            p_user_id,
            'ticker_tour',
            p_prediction_id,
            jsonb_build_object('distinct_tickers', distinct_tickers)
        );
    end if;
end;
$$;

create or replace function public.evaluate_score_badges(
    p_user_id uuid,
    p_prediction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    scored_row public.user_prediction_scores%rowtype;
    close_or_better_count integer;
    recent_scored_count integer;
    recent_direction_hits integer;
begin
    select *
    into scored_row
    from public.user_prediction_scores
    where prediction_id = p_prediction_id
      and user_id = p_user_id
      and xp_awarded > 0;

    if not found then
        return;
    end if;

    if scored_row.score_verdict = 'called_it' then
        perform public.grant_user_badge(
            p_user_id,
            'called_it_once',
            p_prediction_id,
            jsonb_build_object('score_verdict', scored_row.score_verdict)
        );
    end if;

    select count(*)
    into close_or_better_count
    from public.user_prediction_scores
    where user_id = p_user_id
      and xp_awarded > 0
      and score_verdict in ('called_it', 'close_call');

    if close_or_better_count >= 5 then
        perform public.grant_user_badge(
            p_user_id,
            'close_caller',
            p_prediction_id,
            jsonb_build_object('close_or_better_count', close_or_better_count)
        );
    end if;

    if scored_row.prediction_horizon = '1y' then
        perform public.grant_user_badge(
            p_user_id,
            'long_view',
            p_prediction_id,
            '{"horizon":"1y"}'::jsonb
        );
    end if;

    select count(*), coalesce(sum(direction_correct), 0)
    into recent_scored_count, recent_direction_hits
    from (
        select direction_correct
        from public.user_prediction_scores
        where user_id = p_user_id
          and xp_awarded > 0
        order by scored_at desc
        limit 3
    ) recent_scores;

    if recent_scored_count = 3 and recent_direction_hits = 3 then
        perform public.grant_user_badge(
            p_user_id,
            'warm_hand',
            p_prediction_id,
            '{"direction_hits":3}'::jsonb
        );
    end if;
end;
$$;

create or replace function public.grant_scored_prediction_reward(p_prediction_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    score_row public.user_prediction_scores%rowtype;
    inserted_event_id uuid;
begin
    select *
    into score_row
    from public.user_prediction_scores
    where prediction_id = p_prediction_id;

    if not found or score_row.xp_awarded <= 0 then
        return null;
    end if;

    inserted_event_id := public.grant_user_xp(
        score_row.user_id,
        'prediction_scored',
        score_row.xp_awarded,
        score_row.prediction_id,
        null,
        jsonb_build_object(
            'ticker', score_row.ticker,
            'prediction_horizon', score_row.prediction_horizon,
            'score_verdict', score_row.score_verdict,
            'absolute_pct_error', score_row.absolute_pct_error,
            'direction_correct', score_row.direction_correct
        )
    );

    if inserted_event_id is not null then
        insert into public.user_engagement_events (
            user_id,
            event_type,
            headline,
            body,
            source_prediction_id,
            xp_amount,
            metadata
        )
        values (
            score_row.user_id,
            'prediction_scored',
            score_row.ticker || ' prediction scored',
            'Your ' || upper(score_row.prediction_horizon) || ' call earned ' ||
                score_row.xp_awarded || ' XP.',
            score_row.prediction_id,
            score_row.xp_awarded,
            jsonb_build_object(
                'ticker', score_row.ticker,
                'prediction_horizon', score_row.prediction_horizon,
                'score_verdict', score_row.score_verdict,
                'absolute_pct_error', score_row.absolute_pct_error,
                'direction_correct', score_row.direction_correct
            )
        );

        perform public.evaluate_score_badges(score_row.user_id, score_row.prediction_id);
    end if;

    return inserted_event_id;
end;
$$;

create or replace function public.submit_user_prediction(
    p_ticker text,
    p_prediction_horizon text,
    p_predicted_close double precision
)
returns setof public.user_predictions
language plpgsql
security definer
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    normalized_ticker text := upper(trim(p_ticker));
    reference_row record;
    resolved_target_date date;
    saved public.user_predictions%rowtype;
    submission_event_id uuid;
begin
    if current_user_id is null then
        raise exception 'You must be signed in to make a prediction.';
    end if;
    if p_prediction_horizon not in ('1w', '1m', '3m', '1y') then
        raise exception 'Unsupported prediction horizon: %', p_prediction_horizon;
    end if;
    if p_predicted_close <= 0 then
        raise exception 'Predicted close must be greater than zero.';
    end if;

    select *
    into reference_row
    from public.resolve_user_prediction_reference(normalized_ticker)
    limit 1;

    resolved_target_date := public.resolve_user_prediction_target_date(
        reference_row.prediction_date,
        p_prediction_horizon
    );

    insert into public.user_predictions (
        user_id,
        ticker,
        prediction_date,
        target_date,
        prediction_horizon,
        horizon_calendar_days,
        reference_close,
        reference_source,
        reference_as_of,
        reference_market_state,
        predicted_close,
        predicted_return,
        status
    )
    values (
        current_user_id,
        normalized_ticker,
        reference_row.prediction_date,
        resolved_target_date,
        p_prediction_horizon,
        resolved_target_date - reference_row.prediction_date,
        reference_row.reference_close,
        reference_row.reference_source,
        reference_row.reference_as_of,
        reference_row.reference_market_state,
        p_predicted_close,
        p_predicted_close / reference_row.reference_close - 1,
        'pending'
    )
    returning * into saved;

    submission_event_id := public.grant_user_xp(
        current_user_id,
        'prediction_submitted',
        10,
        saved.prediction_id,
        null,
        jsonb_build_object(
            'ticker', saved.ticker,
            'prediction_horizon', saved.prediction_horizon,
            'target_date', saved.target_date
        )
    );

    if submission_event_id is not null then
        insert into public.user_engagement_events (
            user_id,
            event_type,
            headline,
            body,
            source_prediction_id,
            xp_amount,
            metadata
        )
        values (
            current_user_id,
            'prediction_submitted',
            saved.ticker || ' prediction saved',
            'Your ' || upper(saved.prediction_horizon) || ' call earned 10 XP and matures on ' ||
                saved.target_date || '.',
            saved.prediction_id,
            10,
            jsonb_build_object(
                'ticker', saved.ticker,
                'prediction_horizon', saved.prediction_horizon,
                'target_date', saved.target_date
            )
        );
    end if;

    perform public.evaluate_submission_badges(current_user_id, saved.prediction_id);

    return next saved;
end;
$$;
