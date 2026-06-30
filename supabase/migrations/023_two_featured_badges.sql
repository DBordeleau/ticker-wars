alter table public.user_progression
add column if not exists secondary_featured_badge_slug text references public.badge_definitions(slug);

alter table public.user_progression
drop constraint if exists user_progression_distinct_featured_badges_check,
add constraint user_progression_distinct_featured_badges_check check (
    secondary_featured_badge_slug is null
    or featured_badge_slug is null
    or secondary_featured_badge_slug <> featured_badge_slug
);

alter table public.public_user_profiles
add column if not exists secondary_featured_badge_slug text,
add column if not exists secondary_featured_badge_name text,
add column if not exists secondary_featured_badge_rarity text,
add column if not exists secondary_featured_badge_icon_name text;

alter table public.public_user_badges
add column if not exists featured_slot integer;

alter table public.public_user_badges
drop constraint if exists public_user_badges_featured_slot_check,
add constraint public_user_badges_featured_slot_check check (
    featured_slot is null or featured_slot in (1, 2)
);

drop index if exists public.public_user_badges_user_sort_idx;
create index if not exists public_user_badges_user_sort_idx
on public.public_user_badges (user_id, featured_slot nulls last, sort_order, unlocked_at desc);

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
        badge.badge_slug in (progress.featured_badge_slug, progress.secondary_featured_badge_slug),
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

create or replace function public.update_user_featured_badges(
    p_primary_badge_slug text,
    p_secondary_badge_slug text
)
returns public.user_progression
language plpgsql
security definer
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    next_progress public.user_progression%rowtype;
begin
    if current_user_id is null then
        raise exception 'You must be signed in to update featured badges.';
    end if;

    if p_primary_badge_slug is not null and p_secondary_badge_slug is not null
        and p_primary_badge_slug = p_secondary_badge_slug
    then
        raise exception 'Primary and secondary featured badges must be different.';
    end if;

    if p_primary_badge_slug is not null and not exists (
        select 1
        from public.user_badges badge
        where badge.user_id = current_user_id
            and badge.badge_slug = p_primary_badge_slug
    ) then
        raise exception 'You can only feature a badge you have unlocked.';
    end if;

    if p_secondary_badge_slug is not null and not exists (
        select 1
        from public.user_badges badge
        where badge.user_id = current_user_id
            and badge.badge_slug = p_secondary_badge_slug
    ) then
        raise exception 'You can only feature a badge you have unlocked.';
    end if;

    insert into public.user_progression (
        user_id,
        featured_badge_slug,
        secondary_featured_badge_slug,
        equipped_title
    )
    values (
        current_user_id,
        p_primary_badge_slug,
        p_secondary_badge_slug,
        null
    )
    on conflict (user_id) do update set
        featured_badge_slug = excluded.featured_badge_slug,
        secondary_featured_badge_slug = excluded.secondary_featured_badge_slug,
        equipped_title = null
    returning * into next_progress;

    perform public.refresh_public_user_profile(current_user_id);

    return next_progress;
end;
$$;

revoke all on function public.update_user_featured_badges(text, text)
from public;

grant execute on function public.update_user_featured_badges(text, text)
to authenticated;

select public.refresh_public_user_profiles();
