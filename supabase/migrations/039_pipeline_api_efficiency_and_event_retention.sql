create or replace function public.get_latest_price_dates(p_tickers text[])
returns table (
    ticker text,
    date date
)
language sql
stable
security definer
set search_path = public
as $$
    select distinct on (prices.ticker)
        prices.ticker,
        prices.date
    from public.prices
    where prices.ticker = any(coalesce(p_tickers, array[]::text[]))
    order by prices.ticker, prices.date desc
$$;

revoke all on function public.get_latest_price_dates(text[]) from public;
revoke all on function public.get_latest_price_dates(text[]) from anon;
revoke all on function public.get_latest_price_dates(text[]) from authenticated;
grant execute on function public.get_latest_price_dates(text[]) to service_role;

create index if not exists user_engagement_events_prune_seen_idx
on public.user_engagement_events (digest_seen_at, toast_seen_at, seen_at)
where digest_seen_at is not null;

create or replace function public.prune_user_engagement_events(
    p_seen_before timestamptz default now() - interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    deleted_count integer;
begin
    delete from public.user_engagement_events
    where digest_seen_at is not null
      and digest_seen_at < p_seen_before
      and (
          event_type not in (
              'prediction_scored',
              'badge_unlocked',
              'level_reached',
              'prediction_due_today'
          )
          or coalesce(toast_seen_at, seen_at) is not null
      )
      and coalesce(toast_seen_at, seen_at, digest_seen_at) < p_seen_before;

    get diagnostics deleted_count = row_count;
    return deleted_count;
end;
$$;

revoke all on function public.prune_user_engagement_events(timestamptz) from public;
revoke all on function public.prune_user_engagement_events(timestamptz) from anon;
revoke all on function public.prune_user_engagement_events(timestamptz) from authenticated;
grant execute on function public.prune_user_engagement_events(timestamptz) to service_role;
