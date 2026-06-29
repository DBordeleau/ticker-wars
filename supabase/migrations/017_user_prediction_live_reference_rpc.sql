alter table public.user_predictions
    add column if not exists reference_source text not null default 'daily_close',
    add column if not exists reference_as_of timestamptz,
    add column if not exists reference_market_state text not null default 'closed';

alter table public.user_predictions
    drop constraint if exists user_predictions_reference_source_check,
    add constraint user_predictions_reference_source_check check (
        reference_source in ('live_price', 'daily_close')
    );

alter table public.user_predictions
    drop constraint if exists user_predictions_reference_market_state_check,
    add constraint user_predictions_reference_market_state_check check (
        reference_market_state in ('pre', 'regular', 'post', 'closed', 'unknown')
    );

alter table public.user_prediction_revisions
    add column if not exists reference_source text,
    add column if not exists reference_as_of timestamptz,
    add column if not exists reference_market_state text;

create or replace function public.nyse_observed_fixed_holiday(
    p_year integer,
    p_month integer,
    p_day integer
)
returns date
language plpgsql
immutable
as $$
declare
    holiday date := make_date(p_year, p_month, p_day);
    iso_dow integer := extract(isodow from holiday)::integer;
begin
    if iso_dow = 6 then
        return holiday - 1;
    end if;
    if iso_dow = 7 then
        return holiday + 1;
    end if;
    return holiday;
end;
$$;

create or replace function public.nyse_nth_weekday(
    p_year integer,
    p_month integer,
    p_iso_dow integer,
    p_occurrence integer
)
returns date
language plpgsql
immutable
as $$
declare
    first_day date := make_date(p_year, p_month, 1);
    first_iso_dow integer := extract(isodow from first_day)::integer;
    offset_days integer;
begin
    offset_days := (p_iso_dow - first_iso_dow + 7) % 7;
    return first_day + offset_days + ((p_occurrence - 1) * 7);
end;
$$;

create or replace function public.nyse_last_weekday(
    p_year integer,
    p_month integer,
    p_iso_dow integer
)
returns date
language plpgsql
immutable
as $$
declare
    last_day date := (date_trunc('month', make_date(p_year, p_month, 1)) + interval '1 month - 1 day')::date;
    last_iso_dow integer := extract(isodow from last_day)::integer;
    offset_days integer;
begin
    offset_days := (last_iso_dow - p_iso_dow + 7) % 7;
    return last_day - offset_days;
end;
$$;

create or replace function public.nyse_easter_sunday(p_year integer)
returns date
language plpgsql
immutable
as $$
declare
    a integer := p_year % 19;
    b integer := p_year / 100;
    c integer := p_year % 100;
    d integer := b / 4;
    e integer := b % 4;
    f integer := (b + 8) / 25;
    g integer := (b - f + 1) / 3;
    h integer := (19 * a + b - d - g + 15) % 30;
    i integer := c / 4;
    k integer := c % 4;
    correction integer := (32 + 2 * e + 2 * i - h - k) % 7;
    m integer := (a + 11 * h + 22 * correction) / 451;
    easter_month integer := (h + correction - 7 * m + 114) / 31;
    easter_day integer := ((h + correction - 7 * m + 114) % 31) + 1;
begin
    return make_date(p_year, easter_month, easter_day);
end;
$$;

create or replace function public.is_nyse_holiday(p_value date)
returns boolean
language sql
immutable
as $$
    select p_value in (
        public.nyse_observed_fixed_holiday(extract(year from p_value)::integer, 1, 1),
        public.nyse_nth_weekday(extract(year from p_value)::integer, 1, 1, 3),
        public.nyse_nth_weekday(extract(year from p_value)::integer, 2, 1, 3),
        public.nyse_easter_sunday(extract(year from p_value)::integer) - 2,
        public.nyse_last_weekday(extract(year from p_value)::integer, 5, 1),
        public.nyse_observed_fixed_holiday(extract(year from p_value)::integer, 6, 19),
        public.nyse_observed_fixed_holiday(extract(year from p_value)::integer, 7, 4),
        public.nyse_nth_weekday(extract(year from p_value)::integer, 9, 1, 1),
        public.nyse_nth_weekday(extract(year from p_value)::integer, 11, 4, 4),
        public.nyse_observed_fixed_holiday(extract(year from p_value)::integer, 12, 25)
    );
$$;

create or replace function public.is_nyse_trading_day(p_value date)
returns boolean
language sql
immutable
as $$
    select extract(isodow from p_value)::integer < 6
        and not public.is_nyse_holiday(p_value);
$$;

create or replace function public.roll_forward_to_nyse_trading_day(p_value date)
returns date
language plpgsql
immutable
as $$
declare
    candidate date := p_value;
begin
    while not public.is_nyse_trading_day(candidate) loop
        candidate := candidate + 1;
    end loop;
    return candidate;
end;
$$;

create or replace function public.resolve_user_prediction_target_date(
    p_prediction_date date,
    p_prediction_horizon text
)
returns date
language plpgsql
immutable
as $$
declare
    raw_target date;
begin
    if p_prediction_horizon = '1w' then
        raw_target := p_prediction_date + 7;
    elsif p_prediction_horizon = '1m' then
        raw_target := (p_prediction_date + interval '1 month')::date;
    elsif p_prediction_horizon = '3m' then
        raw_target := (p_prediction_date + interval '3 months')::date;
    elsif p_prediction_horizon = '1y' then
        raw_target := (p_prediction_date + interval '1 year')::date;
    else
        raise exception 'Unsupported prediction horizon: %', p_prediction_horizon;
    end if;

    return public.roll_forward_to_nyse_trading_day(raw_target);
end;
$$;

create or replace function public.is_regular_market_time(p_now timestamptz default now())
returns boolean
language plpgsql
stable
as $$
declare
    local_now timestamp := timezone('America/New_York', p_now);
begin
    return extract(isodow from local_now)::integer < 6
        and local_now::time >= time '09:30'
        and local_now::time < time '16:00'
        and public.is_nyse_trading_day(local_now::date);
end;
$$;

create or replace function public.resolve_user_prediction_reference(p_ticker text)
returns table (
    reference_close double precision,
    reference_source text,
    reference_as_of timestamptz,
    reference_market_state text,
    prediction_date date
)
language plpgsql
stable
set search_path = public
as $$
declare
    normalized_ticker text := upper(trim(p_ticker));
    live_row public.live_price_snapshots%rowtype;
    close_row public.prices%rowtype;
begin
    if normalized_ticker = '' then
        raise exception 'Ticker is required.';
    end if;

    if public.is_regular_market_time(now()) then
        select *
        into live_row
        from public.live_price_snapshots
        where ticker = normalized_ticker
            and market_state = 'regular'
            and stale_after >= now()
            and timezone('America/New_York', as_of)::date = timezone('America/New_York', now())::date
        order by as_of desc
        limit 1;

        if not found then
            raise exception 'Live price is not fresh yet. Try again in a moment.';
        end if;

        reference_close := live_row.price;
        reference_source := 'live_price';
        reference_as_of := live_row.as_of;
        reference_market_state := live_row.market_state;
        prediction_date := timezone('America/New_York', live_row.as_of)::date;
        return next;
        return;
    end if;

    select *
    into close_row
    from public.prices
    where ticker = normalized_ticker
    order by date desc
    limit 1;

    if not found then
        raise exception 'No official close is available for %.', normalized_ticker;
    end if;

    reference_close := close_row.close;
    reference_source := 'daily_close';
    reference_as_of := close_row.date::timestamp at time zone 'America/New_York';
    reference_market_state := 'closed';
    prediction_date := close_row.date;
    return next;
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
begin
    if current_user_id is null then
        raise exception 'You must be signed in to make a prediction.';
    end if;
    if p_prediction_horizon not in ('1w', '1m', '3m', '1y') then
        raise exception 'Unsupported prediction horizon: %', p_prediction_horizon;
    end if;
    if p_predicted_close is null or p_predicted_close <= 0 then
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

    return next saved;
end;
$$;

create or replace function public.edit_user_prediction(
    p_prediction_id uuid,
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
    existing public.user_predictions%rowtype;
    reference_row record;
    resolved_target_date date;
    saved public.user_predictions%rowtype;
begin
    if current_user_id is null then
        raise exception 'You must be signed in to edit a prediction.';
    end if;
    if p_prediction_horizon not in ('1w', '1m', '3m', '1y') then
        raise exception 'Unsupported prediction horizon: %', p_prediction_horizon;
    end if;
    if p_predicted_close is null or p_predicted_close <= 0 then
        raise exception 'Predicted close must be greater than zero.';
    end if;

    select *
    into existing
    from public.user_predictions
    where prediction_id = p_prediction_id
        and user_id = current_user_id
        and status = 'pending'
    for update;

    if not found then
        raise exception 'Editable pending prediction was not found.';
    end if;
    if current_date >= existing.target_date - 7 then
        raise exception 'That prediction is locked and can no longer be edited.';
    end if;

    select *
    into reference_row
    from public.resolve_user_prediction_reference(existing.ticker)
    limit 1;

    resolved_target_date := public.resolve_user_prediction_target_date(
        reference_row.prediction_date,
        p_prediction_horizon
    );

    update public.user_predictions
    set
        prediction_date = reference_row.prediction_date,
        target_date = resolved_target_date,
        prediction_horizon = p_prediction_horizon,
        horizon_calendar_days = resolved_target_date - reference_row.prediction_date,
        reference_close = reference_row.reference_close,
        reference_source = reference_row.reference_source,
        reference_as_of = reference_row.reference_as_of,
        reference_market_state = reference_row.reference_market_state,
        predicted_close = p_predicted_close,
        predicted_return = p_predicted_close / reference_row.reference_close - 1,
        edit_count = edit_count + 1,
        last_edited_at = now()
    where prediction_id = existing.prediction_id
    returning * into saved;

    return next saved;
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
        reference_source,
        reference_as_of,
        reference_market_state,
        predicted_close,
        predicted_return
    )
    values (
        old.prediction_id,
        old.user_id,
        next_revision_number,
        old.prediction_date,
        old.target_date,
        old.prediction_horizon,
        old.reference_close,
        old.reference_source,
        old.reference_as_of,
        old.reference_market_state,
        old.predicted_close,
        old.predicted_return
    );

    return new;
end;
$$;

drop policy if exists "Allow users to insert their predictions"
on public.user_predictions;

drop policy if exists "Allow users to update editable predictions"
on public.user_predictions;

revoke all on function public.submit_user_prediction(text, text, double precision)
from public, anon;
revoke all on function public.edit_user_prediction(uuid, text, double precision)
from public, anon;

grant execute on function public.submit_user_prediction(text, text, double precision)
to authenticated;
grant execute on function public.edit_user_prediction(uuid, text, double precision)
to authenticated;
