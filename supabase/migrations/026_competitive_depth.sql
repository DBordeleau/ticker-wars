create table if not exists public.user_leaderboard_rank_snapshots (
    snapshot_id uuid primary key default gen_random_uuid(),
    snapshot_date date not null,
    generated_at timestamptz not null default now(),
    evaluation_window text not null,
    prediction_horizon text not null,
    user_id uuid not null,
    username text not null,
    rank integer,
    mae double precision,
    directional_accuracy double precision,
    scored_count integer not null default 0,
    is_public boolean not null default true,
    unique (snapshot_date, evaluation_window, prediction_horizon, user_id)
);

create index if not exists user_leaderboard_rank_snapshots_lookup_idx
on public.user_leaderboard_rank_snapshots (
    evaluation_window,
    prediction_horizon,
    snapshot_date desc,
    rank
);

create table if not exists public.dashboard_user_leaderboard_movement (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    current_rank integer,
    previous_rank integer,
    rank_delta integer,
    movement_label text not null,
    mae double precision,
    directional_accuracy double precision,
    scored_count integer not null default 0,
    primary key (evaluation_window, prediction_horizon, user_id)
);

create table if not exists public.dashboard_user_nearby_rivals (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    user_id uuid not null,
    relation text not null,
    user_rank integer,
    rival_user_id uuid not null,
    rival_username text not null,
    rival_avatar_style text not null,
    rival_avatar_seed text not null,
    rival_avatar_options jsonb not null,
    rival_rank integer,
    rank_gap integer,
    mae_gap double precision,
    scored_count_gap integer,
    primary key (evaluation_window, prediction_horizon, user_id, relation)
);

create table if not exists public.public_user_ticker_specialties (
    generated_at timestamptz not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    ticker text not null,
    scored_count integer not null,
    directional_accuracy double precision,
    average_absolute_pct_error double precision,
    best_score_verdict text,
    best_score_verdict_rank integer,
    called_it_count integer not null default 0,
    close_call_or_better_count integer not null default 0,
    ticker_rank integer,
    primary key (user_id, ticker)
);

create index if not exists public_user_ticker_specialties_ticker_idx
on public.public_user_ticker_specialties (ticker, ticker_rank, scored_count desc);

create table if not exists public.challenge_definitions (
    challenge_slug text primary key,
    name text not null,
    description text not null,
    challenge_type text not null,
    target_count integer not null default 1,
    xp_reward integer not null default 0,
    badge_slug text,
    is_active boolean not null default true,
    sort_order integer not null default 100
);

insert into public.challenge_definitions (
    challenge_slug,
    name,
    description,
    challenge_type,
    target_count,
    xp_reward,
    badge_slug,
    sort_order
)
values
    (
        'fill_the_board',
        'Fill the Board',
        'Make active predictions across all four horizons.',
        'active_horizons',
        4,
        50,
        'full_board',
        10
    ),
    (
        'ticker_tour',
        'Ticker Tour',
        'Make predictions on ten different tickers.',
        'distinct_tickers',
        10,
        75,
        'ticker_tour',
        20
    ),
    (
        'close_call_streak',
        'Close Call Hunt',
        'Build toward five Close Call or better scored predictions.',
        'close_call_or_better',
        5,
        100,
        'close_caller',
        30
    )
on conflict (challenge_slug) do update
set
    name = excluded.name,
    description = excluded.description,
    challenge_type = excluded.challenge_type,
    target_count = excluded.target_count,
    xp_reward = excluded.xp_reward,
    badge_slug = excluded.badge_slug,
    sort_order = excluded.sort_order,
    is_active = true;

alter table public.user_leaderboard_rank_snapshots enable row level security;
alter table public.dashboard_user_leaderboard_movement enable row level security;
alter table public.dashboard_user_nearby_rivals enable row level security;
alter table public.public_user_ticker_specialties enable row level security;
alter table public.challenge_definitions enable row level security;

drop policy if exists "Allow public leaderboard snapshot reads"
on public.user_leaderboard_rank_snapshots;
create policy "Allow public leaderboard snapshot reads"
on public.user_leaderboard_rank_snapshots
for select
using (is_public);

drop policy if exists "Allow public leaderboard movement reads"
on public.dashboard_user_leaderboard_movement;
create policy "Allow public leaderboard movement reads"
on public.dashboard_user_leaderboard_movement
for select
using (true);

drop policy if exists "Allow public nearby rival reads"
on public.dashboard_user_nearby_rivals;
create policy "Allow public nearby rival reads"
on public.dashboard_user_nearby_rivals
for select
using (true);

drop policy if exists "Allow public ticker specialty reads"
on public.public_user_ticker_specialties;
create policy "Allow public ticker specialty reads"
on public.public_user_ticker_specialties
for select
using (true);

drop policy if exists "Allow public challenge reads"
on public.challenge_definitions;
create policy "Allow public challenge reads"
on public.challenge_definitions
for select
using (is_active);

create or replace function public.refresh_public_user_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    profile_row public.user_profiles%rowtype;
begin
    delete from public.public_user_profile_predictions where user_id = p_user_id;
    delete from public.public_user_badges where user_id = p_user_id;
    delete from public.public_user_profiles where user_id = p_user_id;

    select *
    into profile_row
    from public.user_profiles
    where user_id = p_user_id;

    if not found or profile_row.is_public = false then
        return;
    end if;

    insert into public.public_user_profiles (
        user_id,
        username,
        display_username,
        avatar_style,
        avatar_seed,
        avatar_options,
        level,
        total_xp,
        featured_badge_slug,
        featured_badge_name,
        featured_badge_rarity,
        featured_badge_icon_name,
        secondary_featured_badge_slug,
        secondary_featured_badge_name,
        secondary_featured_badge_rarity,
        secondary_featured_badge_icon_name,
        equipped_title,
        badge_count,
        scored_count,
        active_prediction_count,
        called_it_count,
        close_call_or_better_count,
        directional_accuracy,
        average_absolute_pct_error,
        signature_ticker,
        best_score_verdict,
        best_score_verdict_rank,
        last_prediction_at,
        last_scored_at,
        updated_at
    )
    select
        profile_row.user_id,
        profile_row.username::text,
        profile_row.display_username,
        profile_row.avatar_style,
        profile_row.avatar_seed,
        profile_row.avatar_options,
        coalesce(progress.level, 1),
        coalesce(progress.total_xp, 0),
        primary_badge.slug,
        primary_badge.name,
        primary_badge.rarity,
        primary_badge.icon_name,
        secondary_badge.slug,
        secondary_badge.name,
        secondary_badge.rarity,
        secondary_badge.icon_name,
        null,
        coalesce((select count(*) from public.user_badges badge where badge.user_id = p_user_id), 0),
        coalesce((select count(*) from public.user_prediction_scores score where score.user_id = p_user_id), 0),
        coalesce((
            select count(*)
            from public.user_predictions prediction
            where prediction.user_id = p_user_id and prediction.status = 'pending'
        ), 0),
        coalesce((
            select count(*)
            from public.user_prediction_scores score
            where score.user_id = p_user_id and score.score_verdict = 'called_it'
        ), 0),
        coalesce((
            select count(*)
            from public.user_prediction_scores score
            where score.user_id = p_user_id and score.score_verdict in ('called_it', 'close_call')
        ), 0),
        (
            select avg(score.direction_correct::double precision)
            from public.user_prediction_scores score
            where score.user_id = p_user_id
        ),
        (
            select avg(score.absolute_pct_error)
            from public.user_prediction_scores score
            where score.user_id = p_user_id
        ),
        (
            select score.ticker
            from public.user_prediction_scores score
            where score.user_id = p_user_id
            group by score.ticker
            order by count(*) desc, score.ticker
            limit 1
        ),
        (
            select score.score_verdict
            from public.user_prediction_scores score
            where score.user_id = p_user_id and score.score_verdict is not null
            order by score.score_verdict_rank nulls last, score.absolute_pct_error, score.scored_at desc
            limit 1
        ),
        (
            select score.score_verdict_rank
            from public.user_prediction_scores score
            where score.user_id = p_user_id and score.score_verdict is not null
            order by score.score_verdict_rank nulls last, score.absolute_pct_error, score.scored_at desc
            limit 1
        ),
        (
            select max(prediction.prediction_date)
            from public.user_predictions prediction
            where prediction.user_id = p_user_id and prediction.status <> 'cancelled'
        ),
        (
            select max(score.scored_at)
            from public.user_prediction_scores score
            where score.user_id = p_user_id
        ),
        now()
    from (select 1) seed
    left join public.user_progression progress
        on progress.user_id = profile_row.user_id
    left join public.badge_definitions primary_badge
        on primary_badge.slug = progress.featured_badge_slug
    left join public.badge_definitions secondary_badge
        on secondary_badge.slug = progress.secondary_featured_badge_slug;

    insert into public.public_user_badges (
        user_id,
        badge_slug,
        name,
        description,
        family,
        rarity,
        icon_name,
        title_unlock,
        sort_order,
        unlocked_at,
        is_featured,
        featured_slot,
        metadata
    )
    select
        badge.user_id,
        definition.slug,
        definition.name,
        definition.description,
        definition.family,
        definition.rarity,
        definition.icon_name,
        definition.title_unlock,
        definition.sort_order,
        badge.unlocked_at,
        coalesce(
            badge.badge_slug in (progress.featured_badge_slug, progress.secondary_featured_badge_slug),
            false
        ),
        case
            when badge.badge_slug = progress.featured_badge_slug then 1
            when badge.badge_slug = progress.secondary_featured_badge_slug then 2
            else null
        end,
        badge.metadata
    from public.user_badges badge
    join public.badge_definitions definition
        on definition.slug = badge.badge_slug
    left join public.user_progression progress
        on progress.user_id = badge.user_id
    where badge.user_id = p_user_id
        and definition.is_active = true
    order by
        case
            when badge.badge_slug = progress.featured_badge_slug then 1
            when badge.badge_slug = progress.secondary_featured_badge_slug then 2
            else 99
        end,
        definition.sort_order,
        badge.unlocked_at desc;

    insert into public.public_user_profile_predictions (
        prediction_id,
        user_id,
        section,
        display_order,
        ticker,
        prediction_date,
        target_date,
        prediction_horizon,
        reference_close,
        predicted_return,
        predicted_close,
        status,
        public_details_hidden,
        actual_close,
        actual_return,
        absolute_error,
        absolute_pct_error,
        direction_correct,
        score_verdict,
        score_verdict_rank,
        score_verdict_color,
        xp_awarded,
        scored_at,
        created_at,
        updated_at
    )
    select
        ranked.prediction_id,
        ranked.user_id,
        ranked.section,
        ranked.display_order,
        ranked.ticker,
        ranked.prediction_date,
        ranked.target_date,
        ranked.prediction_horizon,
        ranked.reference_close,
        case when ranked.public_details_hidden then null else ranked.predicted_return end,
        case when ranked.public_details_hidden then null else ranked.predicted_close end,
        ranked.status,
        ranked.public_details_hidden,
        ranked.actual_close,
        ranked.actual_return,
        ranked.absolute_error,
        ranked.absolute_pct_error,
        ranked.direction_correct,
        ranked.score_verdict,
        ranked.score_verdict_rank,
        ranked.score_verdict_color,
        ranked.xp_awarded,
        ranked.scored_at,
        ranked.created_at,
        ranked.updated_at
    from (
        select
            prediction.prediction_id,
            prediction.user_id,
            case when prediction.status = 'pending' then 'active' else 'recent' end as section,
            row_number() over (
                partition by prediction.status
                order by
                    case when prediction.status = 'pending' then prediction.target_date end asc nulls last,
                    case when prediction.status = 'scored' then score.scored_at end desc nulls last,
                    prediction.prediction_date desc,
                    prediction.created_at desc
            ) as display_order,
            prediction.ticker,
            prediction.prediction_date,
            prediction.target_date,
            prediction.prediction_horizon,
            prediction.reference_close,
            prediction.predicted_return,
            prediction.predicted_close,
            prediction.status,
            prediction.status = 'pending' and prediction.hide_details_until_scored as public_details_hidden,
            score.actual_close,
            score.actual_return,
            score.absolute_error,
            score.absolute_pct_error,
            score.direction_correct,
            score.score_verdict,
            score.score_verdict_rank,
            score.score_verdict_color,
            score.xp_awarded,
            score.scored_at,
            prediction.created_at,
            prediction.updated_at
        from public.user_predictions prediction
        left join public.user_prediction_scores score
            on score.prediction_id = prediction.prediction_id
        where prediction.user_id = p_user_id
            and (
                prediction.status = 'pending'
                or (prediction.status = 'scored' and score.prediction_id is not null)
            )
    ) ranked
    where (ranked.section = 'active' and ranked.display_order <= 8)
        or (ranked.section = 'recent' and ranked.display_order <= 20)
    order by ranked.section, ranked.display_order;
end;
$$;

create or replace function public.snapshot_user_leaderboard_ranks(
    p_snapshot_date date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    insert into public.user_leaderboard_rank_snapshots (
        snapshot_date,
        generated_at,
        evaluation_window,
        prediction_horizon,
        user_id,
        username,
        rank,
        mae,
        directional_accuracy,
        scored_count,
        is_public
    )
    select
        p_snapshot_date,
        now(),
        board.evaluation_window,
        board.prediction_horizon,
        board.user_id,
        board.username,
        board.rank,
        board.mae,
        board.directional_accuracy,
        board.scored_count,
        profile.is_public
    from public.dashboard_user_leaderboard board
    join public.user_profiles profile on profile.user_id = board.user_id
    where profile.is_public
    on conflict (snapshot_date, evaluation_window, prediction_horizon, user_id)
    do update set
        generated_at = excluded.generated_at,
        username = excluded.username,
        rank = excluded.rank,
        mae = excluded.mae,
        directional_accuracy = excluded.directional_accuracy,
        scored_count = excluded.scored_count,
        is_public = excluded.is_public;

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.refresh_user_leaderboard_movement()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    delete from public.dashboard_user_leaderboard_movement;

    with current_rows as (
        select
            board.*,
            profile.is_public
        from public.dashboard_user_leaderboard board
        join public.user_profiles profile on profile.user_id = board.user_id
        where profile.is_public
    ),
    ranked as (
        select
            current_rows.*,
            previous.rank as previous_rank,
            case
                when previous.rank is null then null
                when current_rows.rank is null then null
                else previous.rank - current_rows.rank
            end as rank_delta
        from current_rows
        left join lateral (
            select snapshot.rank
            from public.user_leaderboard_rank_snapshots snapshot
            where snapshot.user_id = current_rows.user_id
              and snapshot.evaluation_window = current_rows.evaluation_window
              and snapshot.prediction_horizon = current_rows.prediction_horizon
              and snapshot.snapshot_date < current_date
              and snapshot.is_public
            order by snapshot.snapshot_date desc
            limit 1
        ) previous on true
    )
    insert into public.dashboard_user_leaderboard_movement (
        generated_at,
        evaluation_window,
        prediction_horizon,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        current_rank,
        previous_rank,
        rank_delta,
        movement_label,
        mae,
        directional_accuracy,
        scored_count
    )
    select
        now(),
        evaluation_window,
        prediction_horizon,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        rank,
        previous_rank,
        rank_delta,
        case
            when previous_rank is null then 'new'
            when rank_delta > 0 then 'up'
            when rank_delta < 0 then 'down'
            else 'steady'
        end,
        mae,
        directional_accuracy,
        scored_count
    from ranked;

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.evaluate_public_competition_badges()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    board_row record;
    granted_count integer := 0;
begin
    for board_row in
        select distinct board.user_id, board.rank, board.evaluation_window, board.prediction_horizon
        from public.dashboard_user_leaderboard board
        join public.user_profiles profile on profile.user_id = board.user_id
        where board.rank is not null
          and profile.is_public
    loop
        if board_row.rank <= 10 then
            if public.grant_user_badge(
                board_row.user_id,
                'on_the_board',
                null,
                jsonb_build_object(
                    'trigger', 'leaderboard_rank',
                    'rank', board_row.rank,
                    'evaluation_window', board_row.evaluation_window,
                    'prediction_horizon', board_row.prediction_horizon
                )
            ) then
                granted_count := granted_count + 1;
            end if;
        end if;

        if board_row.rank <= 3 then
            if public.grant_user_badge(
                board_row.user_id,
                'podium_finish',
                null,
                jsonb_build_object(
                    'trigger', 'leaderboard_podium',
                    'rank', board_row.rank,
                    'evaluation_window', board_row.evaluation_window,
                    'prediction_horizon', board_row.prediction_horizon
                )
            ) then
                granted_count := granted_count + 1;
            end if;
        end if;

        if board_row.rank = 1 then
            if public.grant_user_badge(
                board_row.user_id,
                'champion',
                null,
                jsonb_build_object(
                    'trigger', 'leaderboard_champion',
                    'evaluation_window', board_row.evaluation_window,
                    'prediction_horizon', board_row.prediction_horizon
                )
            ) then
                granted_count := granted_count + 1;
            end if;
        end if;
    end loop;

    return granted_count;
end;
$$;

create or replace function public.refresh_nearby_rivals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    delete from public.dashboard_user_nearby_rivals;

    with public_board as (
        select board.*
        from public.dashboard_user_leaderboard board
        join public.user_profiles profile on profile.user_id = board.user_id
        where profile.is_public
          and board.rank is not null
    ),
    rival_rows as (
        select
            current_row.generated_at,
            current_row.evaluation_window,
            current_row.prediction_horizon,
            current_row.user_id,
            current_row.username,
            current_row.avatar_style,
            current_row.avatar_seed,
            current_row.avatar_options,
            current_row.mae,
            current_row.directional_accuracy,
            current_row.scored_count,
            current_row.rank,
            'catch'::text as relation,
            rival.user_id as rival_user_id,
            rival.username as rival_username,
            rival.avatar_style as rival_avatar_style,
            rival.avatar_seed as rival_avatar_seed,
            rival.avatar_options as rival_avatar_options,
            rival.mae as rival_mae,
            rival.scored_count as rival_scored_count,
            rival.rank as rival_rank
        from public_board current_row
        join public_board rival
          on rival.evaluation_window = current_row.evaluation_window
         and rival.prediction_horizon = current_row.prediction_horizon
         and rival.rank = current_row.rank - 1
        union all
        select
            current_row.generated_at,
            current_row.evaluation_window,
            current_row.prediction_horizon,
            current_row.user_id,
            current_row.username,
            current_row.avatar_style,
            current_row.avatar_seed,
            current_row.avatar_options,
            current_row.mae,
            current_row.directional_accuracy,
            current_row.scored_count,
            current_row.rank,
            'defend'::text as relation,
            rival.user_id as rival_user_id,
            rival.username as rival_username,
            rival.avatar_style as rival_avatar_style,
            rival.avatar_seed as rival_avatar_seed,
            rival.avatar_options as rival_avatar_options,
            rival.mae as rival_mae,
            rival.scored_count as rival_scored_count,
            rival.rank as rival_rank
        from public_board current_row
        join public_board rival
          on rival.evaluation_window = current_row.evaluation_window
         and rival.prediction_horizon = current_row.prediction_horizon
         and rival.rank = current_row.rank + 1
        union all
        select
            current_row.generated_at,
            current_row.evaluation_window,
            current_row.prediction_horizon,
            current_row.user_id,
            current_row.username,
            current_row.avatar_style,
            current_row.avatar_seed,
            current_row.avatar_options,
            current_row.mae,
            current_row.directional_accuracy,
            current_row.scored_count,
            current_row.rank,
            'podium'::text as relation,
            rival.user_id as rival_user_id,
            rival.username as rival_username,
            rival.avatar_style as rival_avatar_style,
            rival.avatar_seed as rival_avatar_seed,
            rival.avatar_options as rival_avatar_options,
            rival.mae as rival_mae,
            rival.scored_count as rival_scored_count,
            rival.rank as rival_rank
        from public_board current_row
        join public_board rival
          on rival.evaluation_window = current_row.evaluation_window
         and rival.prediction_horizon = current_row.prediction_horizon
         and rival.rank = 3
        where current_row.rank > 3
          and current_row.rank <= 10
    )
    insert into public.dashboard_user_nearby_rivals (
        generated_at,
        evaluation_window,
        prediction_horizon,
        user_id,
        relation,
        user_rank,
        rival_user_id,
        rival_username,
        rival_avatar_style,
        rival_avatar_seed,
        rival_avatar_options,
        rival_rank,
        rank_gap,
        mae_gap,
        scored_count_gap
    )
    select distinct on (user_id, evaluation_window, prediction_horizon, relation)
        now(),
        evaluation_window,
        prediction_horizon,
        user_id,
        relation,
        rank,
        rival_rows.rival_user_id,
        rival_rows.rival_username,
        rival_rows.rival_avatar_style,
        rival_rows.rival_avatar_seed,
        rival_rows.rival_avatar_options,
        rival_rows.rival_rank,
        abs(rank - rival_rows.rival_rank),
        case
            when mae is null or rival_rows.rival_mae is null then null
            else mae - rival_rows.rival_mae
        end,
        scored_count - rival_rows.rival_scored_count
    from rival_rows
    where user_id <> rival_rows.rival_user_id
    order by user_id, evaluation_window, prediction_horizon, relation, abs(rank - rival_rows.rival_rank);

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.refresh_user_ticker_specialties(
    p_min_scored_count integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    delete from public.public_user_ticker_specialties;

    with scored as (
        select
            score.user_id,
            profile.username,
            profile.avatar_style,
            profile.avatar_seed,
            profile.avatar_options,
            score.ticker,
            count(*)::integer as scored_count,
            avg(score.direction_correct::double precision) as directional_accuracy,
            avg(score.absolute_pct_error) as average_absolute_pct_error,
            count(*) filter (where score.score_verdict = 'called_it')::integer as called_it_count,
            count(*) filter (where score.score_verdict in ('called_it', 'close_call'))::integer as close_call_or_better_count
        from public.user_prediction_scores score
        join public.user_profiles profile on profile.user_id = score.user_id
        where score.xp_awarded > 0
          and profile.is_public
        group by
            score.user_id,
            profile.username,
            profile.avatar_style,
            profile.avatar_seed,
            profile.avatar_options,
            score.ticker
        having count(*) >= greatest(p_min_scored_count, 1)
    ),
    best_scores as (
        select distinct on (score.user_id, score.ticker)
            score.user_id,
            score.ticker,
            score.score_verdict as best_score_verdict,
            score.score_verdict_rank as best_score_verdict_rank
        from public.user_prediction_scores score
        join scored on scored.user_id = score.user_id and scored.ticker = score.ticker
        where score.score_verdict is not null
        order by score.user_id, score.ticker, score.score_verdict_rank nulls last, score.absolute_pct_error
    ),
    ranked as (
        select
            scored.*,
            best_scores.best_score_verdict,
            best_scores.best_score_verdict_rank,
            rank() over (
                partition by scored.ticker
                order by
                    scored.average_absolute_pct_error asc nulls last,
                    scored.directional_accuracy desc nulls last,
                    scored.scored_count desc,
                    scored.username
            ) as ticker_rank
        from scored
        left join best_scores
          on best_scores.user_id = scored.user_id
         and best_scores.ticker = scored.ticker
    )
    insert into public.public_user_ticker_specialties (
        generated_at,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        ticker,
        scored_count,
        directional_accuracy,
        average_absolute_pct_error,
        best_score_verdict,
        best_score_verdict_rank,
        called_it_count,
        close_call_or_better_count,
        ticker_rank
    )
    select
        now(),
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        ticker,
        scored_count,
        directional_accuracy,
        average_absolute_pct_error,
        best_score_verdict,
        best_score_verdict_rank,
        called_it_count,
        close_call_or_better_count,
        ticker_rank
    from ranked;

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.refresh_competitive_depth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    snapshot_count integer;
    movement_count integer;
    badge_count integer;
    rival_count integer;
    specialty_count integer;
begin
    snapshot_count := public.snapshot_user_leaderboard_ranks();
    movement_count := public.refresh_user_leaderboard_movement();
    badge_count := public.evaluate_public_competition_badges();
    rival_count := public.refresh_nearby_rivals();
    specialty_count := public.refresh_user_ticker_specialties();

    return jsonb_build_object(
        'snapshots', snapshot_count,
        'movement', movement_count,
        'badges', badge_count,
        'rivals', rival_count,
        'specialties', specialty_count
    );
end;
$$;

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

        delete from public.dashboard_user_leaderboard_movement
        where user_id = new.user_id;

        delete from public.dashboard_user_nearby_rivals
        where user_id = new.user_id or rival_user_id = new.user_id;

        delete from public.public_user_ticker_specialties
        where user_id = new.user_id;

        update public.user_leaderboard_rank_snapshots
        set is_public = false
        where user_id = new.user_id;
    end if;

    return new;
end;
$$;

grant select on public.user_leaderboard_rank_snapshots to anon, authenticated;
grant select on public.dashboard_user_leaderboard_movement to anon, authenticated;
grant select on public.dashboard_user_nearby_rivals to anon, authenticated;
grant select on public.public_user_ticker_specialties to anon, authenticated;
grant select on public.challenge_definitions to anon, authenticated;

grant execute on function public.snapshot_user_leaderboard_ranks(date) to service_role;
grant execute on function public.refresh_user_leaderboard_movement() to service_role;
grant execute on function public.evaluate_public_competition_badges() to service_role;
grant execute on function public.refresh_nearby_rivals() to service_role;
grant execute on function public.refresh_user_ticker_specialties(integer) to service_role;
grant execute on function public.refresh_competitive_depth() to service_role;

select public.refresh_competitive_depth();
select public.refresh_public_user_profiles();
