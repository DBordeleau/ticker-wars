create or replace function public.assert_prediction_ticker_available(p_ticker text)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
    normalized_ticker text := upper(trim(coalesce(p_ticker, '')));
begin
    if normalized_ticker = '' then
        raise exception 'Ticker is required.';
    end if;

    if normalized_ticker = 'QQQ' then
        raise exception 'QQQ has been removed from Ticker Wars.';
    end if;
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
    perform public.assert_prediction_ticker_available(normalized_ticker);

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

do $$
declare
    removed_ticker constant text := 'QQQ';
begin
    if to_regclass('public.user_predictions') is not null then
        delete from public.user_predictions where ticker = removed_ticker;
    end if;

    if to_regclass('public.predictions') is not null then
        delete from public.predictions where ticker = removed_ticker;
    end if;

    if to_regclass('public.prediction_scores') is not null then
        delete from public.prediction_scores where ticker = removed_ticker;
    end if;

    if to_regclass('public.features') is not null then
        delete from public.features where ticker = removed_ticker;
    end if;

    if to_regclass('public.prices') is not null then
        delete from public.prices where ticker = removed_ticker;
    end if;

    if to_regclass('public.fundamentals') is not null then
        delete from public.fundamentals where ticker = removed_ticker;
    end if;

    if to_regclass('public.ticker_assets') is not null then
        execute 'delete from public.ticker_assets where ticker = $1' using removed_ticker;
    end if;

    if to_regclass('public.live_price_snapshots') is not null then
        delete from public.live_price_snapshots where ticker = removed_ticker;
    end if;

    if to_regclass('public.dashboard_latest_predictions') is not null then
        delete from public.dashboard_latest_predictions where ticker = removed_ticker;
    end if;

    if to_regclass('public.dashboard_ticker_history') is not null then
        delete from public.dashboard_ticker_history where ticker = removed_ticker;
    end if;

    if to_regclass('public.dashboard_latest_user_predictions') is not null then
        delete from public.dashboard_latest_user_predictions where ticker = removed_ticker;
    end if;

    if to_regclass('public.dashboard_user_ticker_leaderboard') is not null then
        delete from public.dashboard_user_ticker_leaderboard where ticker = removed_ticker;
    end if;
end;
$$;
