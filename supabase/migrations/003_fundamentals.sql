create table if not exists public.fundamentals (
    ticker text not null,
    as_of_date date not null,
    market_cap double precision,
    trailing_pe double precision,
    forward_pe double precision,
    price_to_book double precision,
    price_to_sales double precision,
    revenue_ttm double precision,
    revenue_growth double precision,
    net_income_ttm double precision,
    profit_margin double precision,
    operating_margin double precision,
    free_cash_flow double precision,
    total_debt double precision,
    debt_to_equity double precision,
    current_ratio double precision,
    sector text,
    industry text,
    source text not null default 'yfinance',
    raw_json jsonb,
    ingested_at timestamptz not null default now(),
    primary key (ticker, as_of_date)
);

create index if not exists fundamentals_ticker_date_idx
on public.fundamentals (ticker, as_of_date desc);

alter table public.fundamentals enable row level security;

