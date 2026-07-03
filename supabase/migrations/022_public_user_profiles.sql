alter table public.user_predictions
add column if not exists hide_details_until_scored boolean not null default false;

alter table public.user_prediction_revisions
add column if not exists hide_details_until_scored boolean not null default false;

alter table public.dashboard_latest_user_predictions
add column if not exists hide_details_until_scored boolean not null default false;

alter table public.dashboard_latest_user_predictions
alter column predicted_return drop not null,
alter column predicted_close drop not null;

create table if not exists public.public_user_profiles (
    user_id uuid primary key references public.user_profiles(user_id) on delete cascade,
    username text not null unique,
    display_username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null default '{}'::jsonb,
    level integer not null default 1,
    total_xp integer not null default 0,
    featured_badge_slug text,
    featured_badge_name text,
    featured_badge_rarity text,
    featured_badge_icon_name text,
    equipped_title text,
    badge_count integer not null default 0,
    scored_count integer not null default 0,
    active_prediction_count integer not null default 0,
    called_it_count integer not null default 0,
    close_call_or_better_count integer not null default 0,
    directional_accuracy double precision,
    average_absolute_pct_error double precision,
    signature_ticker text,
    best_score_verdict text,
    best_score_verdict_rank integer,
    last_prediction_at date,
    last_scored_at timestamptz,
    updated_at timestamptz not null default now()
);

create table if not exists public.public_user_badges (
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    badge_slug text not null,
    name text not null,
    description text not null,
    family text not null,
    rarity text not null,
    icon_name text not null,
    title_unlock text,
    sort_order integer not null default 0,
    unlocked_at timestamptz not null,
    is_featured boolean not null default false,
    metadata jsonb not null default '{}'::jsonb,
    primary key (user_id, badge_slug)
);

create index if not exists public_user_badges_user_sort_idx
on public.public_user_badges (user_id, is_featured desc, sort_order, unlocked_at desc);

create table if not exists public.public_user_profile_predictions (
    prediction_id uuid primary key references public.user_predictions(prediction_id) on delete cascade,
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    section text not null,
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

create index if not exists public_user_profile_predictions_user_section_idx
on public.public_user_profile_predictions (user_id, section, display_order);

alter table public.public_user_profiles enable row level security;
alter table public.public_user_badges enable row level security;
alter table public.public_user_profile_predictions enable row level security;

drop policy if exists "Allow public user profile projection reads"
on public.public_user_profiles;
create policy "Allow public user profile projection reads"
on public.public_user_profiles
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public user badge projection reads"
on public.public_user_badges;
create policy "Allow public user badge projection reads"
on public.public_user_badges
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public profile prediction projection reads"
on public.public_user_profile_predictions;
create policy "Allow public profile prediction projection reads"
on public.public_user_profile_predictions
for select
to anon, authenticated
using (true);

create or replace function public.refresh_dashboard_latest_user_predictions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.dashboard_latest_user_predictions
    where generated_at is not null;

    insert into public.dashboard_latest_user_predictions (
        generated_at,
        prediction_id,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        prediction_date,
        target_date,
        prediction_horizon,
        ticker,
        reference_close,
        predicted_return,
        predicted_close,
        hide_details_until_scored
    )
    select
        now(),
        prediction.prediction_id,
        prediction.user_id,
        coalesce(profile.display_username, profile.username::text, prediction.user_id::text),
        coalesce(profile.avatar_style, 'adventurer-neutral'),
        coalesce(profile.avatar_seed, prediction.user_id::text),
        coalesce(profile.avatar_options, '{}'::jsonb),
        prediction.prediction_date,
        prediction.target_date,
        prediction.prediction_horizon,
        prediction.ticker,
        prediction.reference_close,
        case
            when prediction.status = 'pending' and prediction.hide_details_until_scored then null
            else prediction.predicted_return
        end,
        case
            when prediction.status = 'pending' and prediction.hide_details_until_scored then null
            else prediction.predicted_close
        end,
        prediction.status = 'pending' and prediction.hide_details_until_scored
    from public.user_predictions prediction
    join public.user_profiles profile
        on profile.user_id = prediction.user_id
    where profile.is_public = true
        and prediction.status <> 'cancelled'
        and prediction.prediction_date = (
            select max(latest_prediction.prediction_date)
            from public.user_predictions latest_prediction
            join public.user_profiles latest_profile
                on latest_profile.user_id = latest_prediction.user_id
            where latest_profile.is_public = true
                and latest_prediction.status <> 'cancelled'
        )
    order by prediction.ticker, lower(coalesce(profile.display_username, profile.username::text));
end;
$$;

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
        featured.slug,
        featured.name,
        featured.rarity,
        featured.icon_name,
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
    left join public.badge_definitions featured
        on featured.slug = progress.featured_badge_slug;

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
        coalesce(progress.featured_badge_slug = badge.badge_slug, false),
        badge.metadata
    from public.user_badges badge
    join public.badge_definitions definition
        on definition.slug = badge.badge_slug
    left join public.user_progression progress
        on progress.user_id = badge.user_id
    where badge.user_id = p_user_id
        and definition.is_active = true
    order by
        coalesce(progress.featured_badge_slug = badge.badge_slug, false) desc,
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

create or replace function public.refresh_public_user_profiles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    profile_record record;
    refreshed_count integer := 0;
begin
    for profile_record in
        select user_id from public.user_profiles
    loop
        perform public.refresh_public_user_profile(profile_record.user_id);
        refreshed_count := refreshed_count + 1;
    end loop;

    return refreshed_count;
end;
$$;

create or replace function public.refresh_public_user_profile_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'DELETE' then
        perform public.refresh_public_user_profile(old.user_id);
        return old;
    end if;

    perform public.refresh_public_user_profile(new.user_id);
    return new;
end;
$$;

create or replace function public.record_user_prediction_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_revision_number integer;
begin
    if old.predicted_close is not distinct from new.predicted_close
        and old.reference_close is not distinct from new.reference_close
        and old.prediction_date is not distinct from new.prediction_date
        and old.target_date is not distinct from new.target_date
        and old.prediction_horizon is not distinct from new.prediction_horizon
    then
        return new;
    end if;

    select coalesce(max(revision_number), 0) + 1
    into next_revision_number
    from public.user_prediction_revisions
    where prediction_id = old.prediction_id;

    insert into public.user_prediction_revisions (
        prediction_id,
        user_id,
        revision_number,
        prediction_date,
        target_date,
        prediction_horizon,
        reference_close,
        predicted_close,
        predicted_return,
        hide_details_until_scored
    )
    values (
        old.prediction_id,
        old.user_id,
        next_revision_number,
        old.prediction_date,
        old.target_date,
        old.prediction_horizon,
        old.reference_close,
        old.predicted_close,
        old.predicted_return,
        old.hide_details_until_scored
    );

    return new;
end;
$$;

drop trigger if exists refresh_public_user_profile_on_profile_change
on public.user_profiles;
create trigger refresh_public_user_profile_on_profile_change
after insert or update or delete on public.user_profiles
for each row
execute function public.refresh_public_user_profile_trigger();

drop trigger if exists refresh_public_user_profile_on_progression_change
on public.user_progression;
create trigger refresh_public_user_profile_on_progression_change
after insert or update or delete on public.user_progression
for each row
execute function public.refresh_public_user_profile_trigger();

drop trigger if exists refresh_public_user_profile_on_badge_change
on public.user_badges;
create trigger refresh_public_user_profile_on_badge_change
after insert or update or delete on public.user_badges
for each row
execute function public.refresh_public_user_profile_trigger();

drop trigger if exists refresh_public_user_profile_on_prediction_change
on public.user_predictions;
create trigger refresh_public_user_profile_on_prediction_change
after insert or update or delete on public.user_predictions
for each row
execute function public.refresh_public_user_profile_trigger();

drop trigger if exists refresh_public_user_profile_on_score_change
on public.user_prediction_scores;
create trigger refresh_public_user_profile_on_score_change
after insert or update or delete on public.user_prediction_scores
for each row
execute function public.refresh_public_user_profile_trigger();

create or replace function public.update_user_profile_identity(
    p_featured_badge_slug text,
    p_equipped_title text
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
        raise exception 'You must be signed in to update profile identity.';
    end if;

    if p_featured_badge_slug is not null and not exists (
        select 1
        from public.user_badges badge
        where badge.user_id = current_user_id
            and badge.badge_slug = p_featured_badge_slug
    ) then
        raise exception 'You can only feature a badge you have unlocked.';
    end if;

    if p_equipped_title is not null and not exists (
        select 1
        from public.user_badges badge
        join public.badge_definitions definition
            on definition.slug = badge.badge_slug
        where badge.user_id = current_user_id
            and definition.title_unlock = p_equipped_title
    ) then
        raise exception 'You can only equip a title you have unlocked.';
    end if;

    insert into public.user_progression (user_id, featured_badge_slug, equipped_title)
    values (current_user_id, p_featured_badge_slug, p_equipped_title)
    on conflict (user_id) do update set
        featured_badge_slug = excluded.featured_badge_slug,
        equipped_title = excluded.equipped_title
    returning * into next_progress;

    perform public.refresh_public_user_profile(current_user_id);

    return next_progress;
end;
$$;

create or replace function public.submit_user_prediction(
    p_ticker text,
    p_prediction_horizon text,
    p_predicted_close double precision,
    p_hide_details_until_scored boolean
)
returns setof public.user_predictions
language plpgsql
security definer
set search_path = public
as $$
declare
    saved public.user_predictions%rowtype;
begin
    select *
    into saved
    from public.submit_user_prediction(
        p_ticker,
        p_prediction_horizon,
        p_predicted_close
    )
    limit 1;

    update public.user_predictions
    set hide_details_until_scored = coalesce(p_hide_details_until_scored, false)
    where prediction_id = saved.prediction_id
    returning * into saved;

    perform public.refresh_dashboard_latest_user_predictions();
    perform public.refresh_public_user_profile(saved.user_id);

    return next saved;
end;
$$;

create or replace function public.edit_user_prediction(
    p_prediction_id uuid,
    p_prediction_horizon text,
    p_predicted_close double precision,
    p_hide_details_until_scored boolean
)
returns setof public.user_predictions
language plpgsql
security definer
set search_path = public
as $$
declare
    saved public.user_predictions%rowtype;
begin
    select *
    into saved
    from public.edit_user_prediction(
        p_prediction_id,
        p_prediction_horizon,
        p_predicted_close
    )
    limit 1;

    update public.user_predictions
    set hide_details_until_scored = coalesce(p_hide_details_until_scored, false)
    where prediction_id = saved.prediction_id
    returning * into saved;

    perform public.refresh_dashboard_latest_user_predictions();
    perform public.refresh_public_user_profile(saved.user_id);

    return next saved;
end;
$$;

revoke all on function public.refresh_public_user_profile(uuid)
from public;
revoke all on function public.refresh_public_user_profiles()
from public;
revoke all on function public.update_user_profile_identity(text, text)
from public;
revoke all on function public.submit_user_prediction(text, text, double precision, boolean)
from public;
revoke all on function public.edit_user_prediction(uuid, text, double precision, boolean)
from public;

grant execute on function public.refresh_public_user_profiles()
to authenticated;
grant execute on function public.update_user_profile_identity(text, text)
to authenticated;
grant execute on function public.submit_user_prediction(text, text, double precision, boolean)
to authenticated;
grant execute on function public.edit_user_prediction(uuid, text, double precision, boolean)
to authenticated;

select public.refresh_dashboard_latest_user_predictions();
select public.refresh_public_user_profiles();
