create table if not exists public.live_price_snapshots (
    ticker text primary key,
    provider text not null,
    provider_symbol text not null,
    currency text,
    market_state text not null,
    price double precision not null,
    previous_close double precision,
    day_open double precision,
    day_high double precision,
    day_low double precision,
    day_volume bigint,
    change double precision,
    change_percent double precision,
    as_of timestamptz not null,
    fetched_at timestamptz not null default now(),
    stale_after timestamptz not null,
    provider_metadata jsonb not null default '{}'::jsonb,
    constraint live_price_snapshots_ticker_upper_check check (ticker = upper(ticker)),
    constraint live_price_snapshots_price_check check (price > 0),
    constraint live_price_snapshots_market_state_check check (
        market_state in ('pre', 'regular', 'post', 'closed', 'unknown')
    )
);

create index if not exists live_price_snapshots_stale_after_idx
on public.live_price_snapshots (stale_after);

create table if not exists public.intraday_price_bars (
    ticker text not null,
    ts timestamptz not null,
    provider text not null,
    provider_symbol text not null,
    open double precision,
    high double precision,
    low double precision,
    close double precision not null,
    volume bigint,
    fetched_at timestamptz not null default now(),
    primary key (ticker, ts),
    constraint intraday_price_bars_ticker_upper_check check (ticker = upper(ticker)),
    constraint intraday_price_bars_close_check check (close > 0)
);

create index if not exists intraday_price_bars_ticker_ts_desc_idx
on public.intraday_price_bars (ticker, ts desc);

create table if not exists public.live_price_fetch_events (
    fetch_id uuid primary key default gen_random_uuid(),
    provider text not null,
    requested_tickers text[] not null,
    succeeded_tickers text[] not null default '{}',
    failed_tickers text[] not null default '{}',
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    duration_ms integer,
    error_message text
);

alter table public.live_price_snapshots enable row level security;
alter table public.intraday_price_bars enable row level security;
alter table public.live_price_fetch_events enable row level security;

drop policy if exists "Allow public live price snapshot reads"
on public.live_price_snapshots;

create policy "Allow public live price snapshot reads"
on public.live_price_snapshots
for select
to anon, authenticated
using (true);

drop policy if exists "Allow public intraday price bar reads"
on public.intraday_price_bars;

create policy "Allow public intraday price bar reads"
on public.intraday_price_bars
for select
to anon, authenticated
using (true);

-- No insert/update/delete policies are added. The pipeline writes with the
-- service role, which bypasses RLS, while browser clients can only read the
-- narrow live quote tables.
