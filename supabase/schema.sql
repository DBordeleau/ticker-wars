-- Ticker Wars public reference schema.
--
-- This file documents the intended current database shape for portfolio review.
-- The public edition presents this curated baseline instead of the private
-- iterative migration history.

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.prices (
    ticker text not null,
    date date not null,
    open double precision not null,
    high double precision not null,
    low double precision not null,
    close double precision not null,
    volume bigint not null,
    source text not null,
    ingested_at timestamptz not null default now(),
    primary key (ticker, date)
);

create table if not exists public.features (
    ticker text not null,
    date date not null,
    feature_json jsonb not null,
    target_return_1w double precision,
    target_return_1m double precision,
    target_return_3m double precision,
    target_return_1y double precision,
    target_date_1w date,
    target_date_1m date,
    target_date_3m date,
    target_date_1y date,
    feature_version text not null default 'post_phase_7_pivot',
    created_at timestamptz not null default now(),
    primary key (ticker, date)
);

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
    long_name text,
    short_name text,
    display_name text,
    business_summary text,
    website text,
    source text not null default 'yfinance',
    raw_json jsonb,
    ingested_at timestamptz not null default now(),
    primary key (ticker, as_of_date)
);

create table if not exists public.ticker_assets (
    ticker text primary key,
    logo_data_url text,
    logo_content_type text,
    logo_source text,
    logo_domain text,
    fetched_at timestamptz not null default now()
);

create table if not exists public.predictions (
    prediction_id text primary key,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    horizon_calendar_days integer not null,
    horizon_trading_days integer not null,
    model_name text not null,
    model_slug text not null,
    reference_close double precision not null,
    predicted_return double precision not null,
    predicted_close double precision not null,
    predicted_return_lower double precision,
    predicted_return_upper double precision,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    interval_level double precision not null default 0.80,
    interval_method text,
    reasoning_summary text,
    feature_version text,
    model_version text,
    model_metadata jsonb,
    created_at timestamptz not null default now(),
    constraint predictions_horizon_check check (
        prediction_horizon in ('1w', '1m', '3m', '1y')
    ),
    constraint predictions_interval_level_check check (
        interval_level > 0 and interval_level < 1
    ),
    constraint predictions_interval_order_check check (
        predicted_close_lower is null
        or predicted_close_upper is null
        or predicted_close_lower <= predicted_close_upper
    ),
    unique (ticker, prediction_date, target_date, prediction_horizon, model_slug)
);

create table if not exists public.prediction_scores (
    prediction_id text primary key references public.predictions(prediction_id)
        on update cascade on delete cascade,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    model_name text not null,
    model_slug text not null,
    actual_close double precision not null,
    actual_return double precision not null,
    absolute_error double precision not null,
    squared_error double precision not null,
    absolute_pct_error double precision not null,
    predicted_direction integer not null,
    actual_direction integer not null,
    direction_correct integer not null,
    interval_hit boolean,
    interval_width double precision,
    interval_width_pct double precision,
    interval_miss_distance double precision,
    winkler_score double precision,
    scored_at timestamptz not null default now(),
    constraint prediction_scores_horizon_check check (
        prediction_horizon in ('1w', '1m', '3m', '1y')
    )
);

create table if not exists public.pipeline_runs (
    run_id uuid primary key default gen_random_uuid(),
    started_at timestamptz not null default now(),
    finished_at timestamptz,
    status text not null default 'running',
    latest_price_date date,
    next_target_date date,
    prices_upserted integer not null default 0,
    features_upserted integer not null default 0,
    predictions_upserted integer not null default 0,
    scores_upserted integer not null default 0,
    error_message text,
    constraint pipeline_runs_status_check check (status in ('running', 'success', 'failed'))
);

create table if not exists public.dashboard_latest_predictions (
    generated_at timestamptz not null,
    prediction_id text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    ticker text not null,
    model_name text not null,
    model_slug text not null,
    reference_close double precision not null,
    predicted_return double precision not null,
    predicted_close double precision not null,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    interval_level double precision,
    reasoning_summary text,
    model_metadata jsonb
);

create table if not exists public.dashboard_model_leaderboard (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    model_name text not null,
    model_slug text not null,
    model_type text not null default 'Classic ML',
    mae double precision,
    mape double precision,
    directional_accuracy double precision,
    winkler_score double precision,
    scored_count integer not null,
    rank integer,
    is_toy_model boolean not null default false
);

create table if not exists public.dashboard_model_metrics (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    model_name text not null,
    model_slug text not null,
    mae double precision,
    mape double precision,
    directional_accuracy double precision,
    winkler_score double precision,
    scored_count integer not null
);

create table if not exists public.dashboard_ticker_history (
    generated_at timestamptz not null,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    actual_close double precision,
    model_name text not null,
    model_slug text not null,
    predicted_close double precision not null,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    predicted_return double precision not null,
    actual_return double precision,
    winkler_score double precision,
    reasoning_summary text
);

create table if not exists public.dashboard_run_metadata (
    generated_at timestamptz not null,
    latest_price_date date,
    latest_prediction_date date,
    ticker_count integer not null,
    model_count integer not null,
    prediction_count integer not null default 0,
    user_prediction_count integer not null default 0,
    scored_count integer not null default 0,
    data_source text not null,
    last_pipeline_status text not null
);

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
    provider_metadata jsonb not null default '{}'::jsonb
);

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
    primary key (ticker, ts)
);

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

create table if not exists public.user_profiles (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username citext not null unique,
    display_username text not null,
    is_public boolean not null default true,
    avatar_style text not null default 'adventurer-neutral',
    avatar_seed text not null,
    avatar_options jsonb not null default '{}'::jsonb,
    note text,
    note_moderation_status text not null default 'unreviewed',
    onboarding_completed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.user_predictions (
    prediction_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    horizon_calendar_days integer not null,
    reference_close double precision not null,
    reference_source text not null default 'daily_close',
    reference_as_of timestamptz,
    reference_market_state text not null default 'closed',
    predicted_close double precision not null,
    predicted_return double precision not null,
    hide_details_until_scored boolean not null default false,
    status text not null default 'pending',
    edit_count integer not null default 0,
    last_edited_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.user_prediction_revisions (
    revision_id uuid primary key default gen_random_uuid(),
    prediction_id uuid not null references public.user_predictions(prediction_id)
        on delete cascade,
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    revision_number integer not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    reference_close double precision not null,
    predicted_close double precision not null,
    predicted_return double precision not null,
    hide_details_until_scored boolean not null default false,
    created_at timestamptz not null default now(),
    unique (prediction_id, revision_number)
);

create table if not exists public.user_prediction_scores (
    prediction_id uuid primary key references public.user_predictions(prediction_id)
        on delete cascade,
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    ticker text not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    actual_close double precision not null,
    actual_return double precision not null,
    absolute_error double precision not null,
    squared_error double precision not null,
    absolute_pct_error double precision not null,
    predicted_direction integer not null,
    actual_direction integer not null,
    direction_correct integer not null,
    score_verdict text,
    score_verdict_rank integer,
    score_verdict_color text,
    xp_awarded integer not null default 0,
    scored_at timestamptz not null default now()
);

create table if not exists public.dashboard_user_leaderboard (
    generated_at timestamptz not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    mae double precision,
    mape double precision,
    directional_accuracy double precision,
    scored_count integer not null,
    rank integer
);

create table if not exists public.dashboard_user_ticker_leaderboard (
    generated_at timestamptz not null,
    ticker text not null,
    evaluation_window text not null,
    prediction_horizon text not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    mae double precision,
    mape double precision,
    directional_accuracy double precision,
    scored_count integer not null,
    rank integer
);

create table if not exists public.dashboard_latest_user_predictions (
    generated_at timestamptz not null,
    prediction_id uuid not null,
    user_id uuid not null,
    username text not null,
    avatar_style text not null,
    avatar_seed text not null,
    avatar_options jsonb not null,
    prediction_date date not null,
    target_date date not null,
    prediction_horizon text not null,
    ticker text not null,
    reference_close double precision not null,
    predicted_return double precision,
    predicted_close double precision,
    hide_details_until_scored boolean not null default false
);

create table if not exists public.gamification_config (
    key text primary key,
    value jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.user_level_thresholds (
    level integer primary key,
    total_xp integer not null unique
);

create table if not exists public.badge_definitions (
    slug text primary key,
    name text not null,
    description text not null,
    family text not null,
    rarity text not null,
    icon_name text not null,
    title_unlock text,
    criteria jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.user_progression (
    user_id uuid primary key references public.user_profiles(user_id) on delete cascade,
    total_xp integer not null default 0,
    level integer not null default 1,
    featured_badge_slug text references public.badge_definitions(slug),
    secondary_featured_badge_slug text references public.badge_definitions(slug),
    equipped_title text,
    last_event_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.user_xp_events (
    event_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    event_type text not null,
    xp_amount integer not null,
    source_prediction_id uuid references public.user_predictions(prediction_id)
        on delete set null,
    source_badge_slug text references public.badge_definitions(slug),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    badge_slug text not null references public.badge_definitions(slug),
    unlocked_at timestamptz not null default now(),
    source_prediction_id uuid references public.user_predictions(prediction_id)
        on delete set null,
    source_event_id uuid references public.user_xp_events(event_id) on delete set null,
    metadata jsonb not null default '{}'::jsonb,
    primary key (user_id, badge_slug)
);

create table if not exists public.user_engagement_events (
    event_id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.user_profiles(user_id) on delete cascade,
    event_type text not null,
    headline text not null,
    body text,
    source_prediction_id uuid references public.user_predictions(prediction_id)
        on delete set null,
    source_badge_slug text references public.badge_definitions(slug),
    xp_amount integer,
    metadata jsonb not null default '{}'::jsonb,
    seen_at timestamptz,
    toast_seen_at timestamptz,
    digest_seen_at timestamptz,
    event_key text,
    created_at timestamptz not null default now()
);

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
    secondary_featured_badge_slug text,
    secondary_featured_badge_name text,
    secondary_featured_badge_rarity text,
    secondary_featured_badge_icon_name text,
    equipped_title text,
    badge_count integer not null default 0,
    scored_count integer not null default 0,
    active_prediction_count integer not null default 0,
    called_it_count integer not null default 0,
    close_call_or_better_count integer not null default 0,
    verdict_counts jsonb not null default '{}'::jsonb,
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
    featured_slot integer,
    metadata jsonb not null default '{}'::jsonb,
    primary key (user_id, badge_slug)
);

create table if not exists public.public_user_profile_predictions (
    prediction_id uuid primary key references public.user_predictions(prediction_id)
        on delete cascade,
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

create table if not exists public.public_user_latest_predictions (
    prediction_id uuid primary key references public.user_predictions(prediction_id)
        on delete cascade,
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

create index if not exists prices_date_idx on public.prices (date);
create index if not exists predictions_target_date_idx on public.predictions (target_date);
create index if not exists predictions_date_horizon_idx
    on public.predictions (prediction_date, prediction_horizon);
create index if not exists predictions_ticker_horizon_idx
    on public.predictions (ticker, prediction_horizon);
create index if not exists prediction_scores_horizon_window_idx
    on public.prediction_scores (prediction_horizon, scored_at);
create index if not exists fundamentals_ticker_date_idx
    on public.fundamentals (ticker, as_of_date desc);
create index if not exists dashboard_ticker_history_ticker_date_model_idx
    on public.dashboard_ticker_history (ticker, target_date, model_name);
create index if not exists live_price_snapshots_stale_after_idx
    on public.live_price_snapshots (stale_after);
create index if not exists intraday_price_bars_ticker_ts_desc_idx
    on public.intraday_price_bars (ticker, ts desc);
create index if not exists user_predictions_target_status_idx
    on public.user_predictions (target_date, status);
create index if not exists user_prediction_scores_horizon_window_idx
    on public.user_prediction_scores (prediction_horizon, scored_at);
create index if not exists public_user_profile_predictions_user_section_idx
    on public.public_user_profile_predictions (user_id, section, display_order);
create index if not exists public_user_latest_predictions_user_order_idx
    on public.public_user_latest_predictions (user_id, display_order);
create index if not exists public_user_ticker_specialties_ticker_idx
    on public.public_user_ticker_specialties (ticker, ticker_rank, scored_count desc);

-- Public/browser-facing tables use RLS read policies in production. Backend
-- pipeline writes use service-role credentials and bypass RLS. RPC function
-- bodies are intentionally left in the migrations until the public edition
-- replaces migration history with an executable baseline.
