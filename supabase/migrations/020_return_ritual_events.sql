alter table public.user_engagement_events
add column if not exists toast_seen_at timestamptz,
add column if not exists digest_seen_at timestamptz,
add column if not exists event_key text,
add column if not exists priority integer not null default 50,
add column if not exists action_path text,
add column if not exists expires_at timestamptz;

update public.user_engagement_events
set toast_seen_at = coalesce(toast_seen_at, seen_at)
where seen_at is not null
  and toast_seen_at is null;

create unique index if not exists user_engagement_events_user_event_key_idx
on public.user_engagement_events (user_id, event_key)
where event_key is not null;

create index if not exists user_engagement_events_user_digest_idx
on public.user_engagement_events (user_id, digest_seen_at, priority, created_at desc);

create or replace function public.create_user_engagement_event(
    p_user_id uuid,
    p_event_type text,
    p_headline text,
    p_body text,
    p_source_prediction_id uuid,
    p_source_badge_slug text,
    p_xp_amount integer,
    p_event_key text,
    p_priority integer,
    p_action_path text,
    p_expires_at timestamptz,
    p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    saved_event_id uuid;
begin
    if p_user_id is null then
        return null;
    end if;

    if p_event_key is null then
        insert into public.user_engagement_events (
            user_id,
            event_type,
            headline,
            body,
            source_prediction_id,
            source_badge_slug,
            xp_amount,
            event_key,
            priority,
            action_path,
            expires_at,
            metadata
        )
        values (
            p_user_id,
            p_event_type,
            p_headline,
            p_body,
            p_source_prediction_id,
            p_source_badge_slug,
            p_xp_amount,
            null,
            coalesce(p_priority, 50),
            p_action_path,
            p_expires_at,
            coalesce(p_metadata, '{}'::jsonb)
        )
        returning event_id into saved_event_id;

        return saved_event_id;
    end if;

    insert into public.user_engagement_events (
        user_id,
        event_type,
        headline,
        body,
        source_prediction_id,
        source_badge_slug,
        xp_amount,
        event_key,
        priority,
        action_path,
        expires_at,
        metadata
    )
    values (
        p_user_id,
        p_event_type,
        p_headline,
        p_body,
        p_source_prediction_id,
        p_source_badge_slug,
        p_xp_amount,
        p_event_key,
        coalesce(p_priority, 50),
        p_action_path,
        p_expires_at,
        coalesce(p_metadata, '{}'::jsonb)
    )
    on conflict (user_id, event_key) where event_key is not null
    do update set
        headline = excluded.headline,
        body = excluded.body,
        priority = excluded.priority,
        action_path = excluded.action_path,
        expires_at = excluded.expires_at,
        metadata = excluded.metadata
    returning event_id into saved_event_id;

    return saved_event_id;
end;
$$;

create or replace function public.mark_user_engagement_events_digest_seen(p_event_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_count integer;
begin
    if auth.uid() is null or p_event_ids is null then
        return 0;
    end if;

    update public.user_engagement_events
    set digest_seen_at = now()
    where user_id = auth.uid()
      and event_id = any(p_event_ids)
      and digest_seen_at is null;

    get diagnostics updated_count = row_count;
    return updated_count;
end;
$$;

create or replace function public.mark_user_engagement_events_toast_seen(p_event_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_count integer;
begin
    if auth.uid() is null or p_event_ids is null then
        return 0;
    end if;

    update public.user_engagement_events
    set
        toast_seen_at = now(),
        seen_at = coalesce(seen_at, now())
    where user_id = auth.uid()
      and event_id = any(p_event_ids)
      and toast_seen_at is null;

    get diagnostics updated_count = row_count;
    return updated_count;
end;
$$;

create or replace function public.refresh_user_prediction_timing_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    current_user_id uuid := auth.uid();
    today_et date := timezone('America/New_York', now())::date;
    prediction public.user_predictions%rowtype;
    days_until integer;
    created_count integer := 0;
    event_id uuid;
begin
    if current_user_id is null then
        return 0;
    end if;

    for prediction in
        select *
        from public.user_predictions
        where user_id = current_user_id
          and status = 'pending'
        order by target_date asc
    loop
        days_until := prediction.target_date - today_et;

        if days_until = 0 then
            event_id := public.create_user_engagement_event(
                current_user_id,
                'prediction_due_today',
                prediction.ticker || ' settles today',
                'Your ' || upper(prediction.prediction_horizon) ||
                    ' call will be scored after the official close is available.',
                prediction.prediction_id,
                null,
                null,
                'prediction_due_today:' || prediction.prediction_id,
                25,
                '/me/predictions?highlight=' || prediction.prediction_id,
                ((prediction.target_date + 2)::timestamp at time zone 'America/New_York'),
                jsonb_build_object(
                    'ticker', prediction.ticker,
                    'prediction_horizon', prediction.prediction_horizon,
                    'target_date', prediction.target_date,
                    'days_until', days_until
                )
            );
            created_count := created_count + case when event_id is null then 0 else 1 end;
        elsif days_until > 0 and days_until <= 7 then
            event_id := public.create_user_engagement_event(
                current_user_id,
                'prediction_maturing_soon',
                prediction.ticker || ' matures in ' || days_until || ' day' ||
                    case when days_until = 1 then '' else 's' end,
                'Your ' || upper(prediction.prediction_horizon) ||
                    ' call is almost ready to score.',
                prediction.prediction_id,
                null,
                null,
                'prediction_maturing_soon:' || prediction.prediction_id || ':' || days_until,
                45,
                '/me/predictions?highlight=' || prediction.prediction_id,
                ((prediction.target_date + 1)::timestamp at time zone 'America/New_York'),
                jsonb_build_object(
                    'ticker', prediction.ticker,
                    'prediction_horizon', prediction.prediction_horizon,
                    'target_date', prediction.target_date,
                    'days_until', days_until
                )
            );
            created_count := created_count + case when event_id is null then 0 else 1 end;
        end if;

        if today_et >= prediction.target_date - 7 then
            event_id := public.create_user_engagement_event(
                current_user_id,
                'prediction_locked',
                prediction.ticker || ' is locked',
                'Your ' || upper(prediction.prediction_horizon) ||
                    ' call can no longer be edited before maturity.',
                prediction.prediction_id,
                null,
                null,
                'prediction_locked:' || prediction.prediction_id,
                35,
                '/me/predictions?highlight=' || prediction.prediction_id,
                ((prediction.target_date + 1)::timestamp at time zone 'America/New_York'),
                jsonb_build_object(
                    'ticker', prediction.ticker,
                    'prediction_horizon', prediction.prediction_horizon,
                    'target_date', prediction.target_date,
                    'days_until', days_until
                )
            );
            created_count := created_count + case when event_id is null then 0 else 1 end;
        end if;
    end loop;

    return created_count;
end;
$$;
