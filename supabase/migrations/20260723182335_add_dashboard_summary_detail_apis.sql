create or replace function public.get_public_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    with latest_prediction_rows as (
        select
            generated_at,
            prediction_id,
            prediction_date,
            target_date,
            prediction_horizon,
            ticker,
            model_name,
            model_slug,
            reference_close,
            predicted_return,
            predicted_close,
            predicted_close_lower,
            predicted_close_upper,
            interval_level,
            reasoning_summary,
            case
                when model_slug = 'warren-buffbot' then nullif(
                    jsonb_strip_nulls(
                        jsonb_build_object(
                            'provider', model_metadata -> 'provider',
                            'model', model_metadata -> 'model'
                        )
                    ),
                    '{}'::jsonb
                )
                else null
            end as model_metadata,
            row_number() over (
                partition by ticker, model_slug, prediction_horizon
                order by prediction_date desc, target_date desc, prediction_id desc
            ) as recency_rank
        from public.dashboard_latest_predictions
    )
    select jsonb_build_object(
        'leaderboard',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        generated_at,
                        evaluation_window,
                        prediction_horizon,
                        model_name,
                        model_slug,
                        mae,
                        mape,
                        directional_accuracy,
                        winkler_score,
                        scored_count,
                        rank,
                        is_toy_model,
                        model_type
                    from public.dashboard_model_leaderboard
                    order by evaluation_window, prediction_horizon, rank nulls last, model_name
                ) row_data
            ), '[]'::jsonb),
        'userLeaderboard',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        generated_at,
                        evaluation_window,
                        prediction_horizon,
                        user_id,
                        username,
                        avatar_style,
                        avatar_seed,
                        avatar_options,
                        mae,
                        mape,
                        directional_accuracy,
                        scored_count,
                        rank
                    from public.dashboard_user_leaderboard
                    order by evaluation_window, prediction_horizon, rank nulls last, username
                ) row_data
            ), '[]'::jsonb),
        'userTickerLeaderboard',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        generated_at,
                        ticker,
                        evaluation_window,
                        prediction_horizon,
                        user_id,
                        username,
                        avatar_style,
                        avatar_seed,
                        avatar_options,
                        mae,
                        mape,
                        directional_accuracy,
                        scored_count,
                        rank
                    from public.dashboard_user_ticker_leaderboard
                    order by ticker, evaluation_window, prediction_horizon, rank nulls last, username
                ) row_data
            ), '[]'::jsonb),
        'modelMetrics',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        generated_at,
                        evaluation_window,
                        prediction_horizon,
                        model_name,
                        model_slug,
                        mae,
                        mape,
                        directional_accuracy,
                        winkler_score,
                        scored_count
                    from public.dashboard_model_metrics
                    order by evaluation_window, prediction_horizon, model_name
                ) row_data
            ), '[]'::jsonb),
        'latestPredictions',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        generated_at,
                        prediction_id,
                        prediction_date,
                        target_date,
                        prediction_horizon,
                        ticker,
                        model_name,
                        model_slug,
                        reference_close,
                        predicted_return,
                        predicted_close,
                        predicted_close_lower,
                        predicted_close_upper,
                        interval_level,
                        reasoning_summary,
                        model_metadata
                    from latest_prediction_rows
                    where recency_rank = 1
                    order by prediction_date desc, target_date desc, ticker, model_slug,
                        prediction_horizon
                ) row_data
            ), '[]'::jsonb),
        'latestUserPredictions',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
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
                    from public.dashboard_latest_user_predictions
                    order by prediction_date desc, target_date desc, ticker, username
                    limit 5000
                ) row_data
            ), '[]'::jsonb),
        'tickerAssets', '[]'::jsonb,
        'metadata',
            (
                select to_jsonb(row_data)
                from (
                    select
                        generated_at,
                        latest_price_date,
                        latest_prediction_date,
                        ticker_count,
                        model_count,
                        prediction_count,
                        user_prediction_count,
                        scored_count,
                        data_source,
                        last_pipeline_status
                    from public.dashboard_run_metadata
                    order by generated_at desc
                    limit 1
                ) row_data
            )
    );
$$;

create or replace function public.get_public_dashboard_bundle()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select public.get_public_dashboard_summary();
$$;

create or replace function public.get_public_ticker_history(p_ticker text)
returns table (
    ticker text,
    prediction_date date,
    target_date date,
    prediction_horizon text,
    actual_close double precision,
    model_name text,
    model_slug text,
    predicted_close double precision,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    predicted_return double precision,
    actual_return double precision,
    winkler_score double precision,
    reasoning_summary text
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        history.ticker,
        history.prediction_date,
        history.target_date,
        history.prediction_horizon,
        history.actual_close,
        history.model_name,
        history.model_slug,
        history.predicted_close,
        history.predicted_close_lower,
        history.predicted_close_upper,
        history.predicted_return,
        history.actual_return,
        history.winkler_score,
        history.reasoning_summary
    from public.dashboard_ticker_history history
    where history.ticker = upper(left(trim(p_ticker), 12))
    order by history.target_date, history.model_name;
$$;

revoke all on function public.get_public_dashboard_summary() from public;
revoke all on function public.get_public_dashboard_bundle() from public;
revoke all on function public.get_public_ticker_history(text) from public;

grant execute on function public.get_public_dashboard_summary() to anon, authenticated, service_role;
grant execute on function public.get_public_dashboard_bundle() to anon, authenticated, service_role;
grant execute on function public.get_public_ticker_history(text) to anon, authenticated, service_role;
