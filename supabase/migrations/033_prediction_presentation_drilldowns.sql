create table if not exists public.public_user_latest_predictions (
    prediction_id uuid primary key references public.user_predictions(prediction_id) on delete cascade,
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    display_order integer not null,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    reference_close double precision not null,
    predicted_return double precision,
    predicted_close double precision,
    status text not null,
    public_details_hidden boolean not null default false,
    actual_close double precision,
    actual_return double precision,
    absolute_error double precision,
    absolute_pct_error double precision,
    direction_correct integer,
    score_verdict text,
    score_verdict_rank integer,
    score_verdict_color text,
    xp_awarded integer,
    scored_at timestamptz,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create index if not exists public_user_latest_predictions_user_order_idx
on public.public_user_latest_predictions (user_id, display_order);

alter table public.public_user_latest_predictions enable row level security;

drop policy if exists "Allow public latest profile prediction reads"
on public.public_user_latest_predictions;
create policy "Allow public latest profile prediction reads"
on public.public_user_latest_predictions
for select
to anon, authenticated
using (true);

grant select on public.public_user_latest_predictions to anon, authenticated;

create index if not exists user_prediction_scores_public_window_idx
on public.user_prediction_scores (user_id, prediction_horizon, scored_at desc);

create or replace function public.refresh_public_user_profile(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    profile_row public.user_profiles%rowtype;
begin
    delete from public.public_user_latest_predictions where user_id = p_user_id;
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
        verdict_counts,
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
        primary_featured.slug,
        primary_featured.name,
        primary_featured.rarity,
        primary_featured.icon_name,
        secondary_featured.slug,
        secondary_featured.name,
        secondary_featured.rarity,
        secondary_featured.icon_name,
        progress.equipped_title,
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
        coalesce((
            select jsonb_object_agg(verdict, verdict_count)
            from (
                select score.score_verdict as verdict, count(*) as verdict_count
                from public.user_prediction_scores score
                where score.user_id = p_user_id
                    and score.score_verdict is not null
                group by score.score_verdict
            ) verdict_summary
        ), '{}'::jsonb),
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
    left join public.badge_definitions primary_featured
        on primary_featured.slug = progress.featured_badge_slug
    left join public.badge_definitions secondary_featured
        on secondary_featured.slug = progress.secondary_featured_badge_slug;

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
            progress.featured_badge_slug = badge.badge_slug
            or progress.secondary_featured_badge_slug = badge.badge_slug,
            false
        ),
        case
            when progress.featured_badge_slug = badge.badge_slug then 1
            when progress.secondary_featured_badge_slug = badge.badge_slug then 2
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
            when progress.featured_badge_slug = badge.badge_slug then 1
            when progress.secondary_featured_badge_slug = badge.badge_slug then 2
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

    insert into public.public_user_latest_predictions (
        prediction_id,
        user_id,
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
            row_number() over (
                order by prediction.prediction_date desc, prediction.created_at desc, prediction.target_date desc
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
            and prediction.status <> 'cancelled'
    ) ranked
    where ranked.display_order <= 20
    order by ranked.display_order;
end;
$$;

create or replace function public.get_public_user_scored_predictions(
    p_username text,
    p_evaluation_window text,
    p_prediction_horizon text,
    p_limit integer default 50,
    p_offset integer default 0
)
returns table (
    prediction_id uuid,
    user_id uuid,
    username text,
    display_username text,
    ticker text,
    prediction_date date,
    target_date date,
    prediction_horizon text,
    reference_close double precision,
    predicted_return double precision,
    predicted_close double precision,
    status text,
    actual_close double precision,
    actual_return double precision,
    absolute_error double precision,
    absolute_pct_error double precision,
    direction_correct integer,
    score_verdict text,
    score_verdict_rank integer,
    score_verdict_color text,
    xp_awarded integer,
    scored_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz,
    total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with selected_profile as (
        select profile.user_id, profile.username::text as username, profile.display_username
        from public.user_profiles profile
        where lower(profile.username::text) = lower(trim(p_username))
            and profile.is_public = true
    ),
    public_latest as (
        select max(score.scored_at) as latest_scored_at
        from public.user_prediction_scores score
        join public.user_profiles profile
            on profile.user_id = score.user_id
        where profile.is_public = true
    ),
    filtered as (
        select
            prediction.prediction_id,
            prediction.user_id,
            selected.username,
            selected.display_username,
            prediction.ticker,
            prediction.prediction_date,
            prediction.target_date,
            prediction.prediction_horizon,
            prediction.reference_close,
            prediction.predicted_return,
            prediction.predicted_close,
            prediction.status,
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
        from selected_profile selected
        join public.user_prediction_scores score
            on score.user_id = selected.user_id
        join public.user_predictions prediction
            on prediction.prediction_id = score.prediction_id
        cross join public_latest
        where (
                p_prediction_horizon = 'all'
                or score.prediction_horizon = p_prediction_horizon
            )
            and (
                p_evaluation_window = 'all'
                or score.scored_at >= public_latest.latest_scored_at
                    - ((replace(p_evaluation_window, 'd', '')::integer - 1) * interval '1 day')
            )
    ),
    counted as (
        select filtered.*, count(*) over () as total_count
        from filtered
    )
    select *
    from counted
    order by scored_at desc, target_date desc, prediction_date desc, ticker
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.get_public_user_scored_predictions(text, text, text, integer, integer)
from public;
grant execute on function public.get_public_user_scored_predictions(text, text, text, integer, integer)
to anon, authenticated;

select public.refresh_public_user_profiles();
