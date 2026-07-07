create index if not exists dashboard_ticker_history_ticker_date_model_idx
on public.dashboard_ticker_history (ticker, target_date, model_name);

create or replace function public.get_public_dashboard_bundle()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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
                        board.generated_at,
                        board.evaluation_window,
                        board.prediction_horizon,
                        board.user_id,
                        board.username,
                        board.avatar_style,
                        board.avatar_seed,
                        board.avatar_options,
                        board.mae,
                        board.mape,
                        board.directional_accuracy,
                        board.scored_count,
                        board.rank
                    from public.dashboard_user_leaderboard board
                    where exists (
                        select 1
                        from public.user_profiles profile
                        where profile.user_id = board.user_id
                            and profile.is_public = true
                    )
                    order by board.evaluation_window, board.prediction_horizon, board.rank nulls last, board.username
                ) row_data
            ), '[]'::jsonb),
        'userTickerLeaderboard',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        board.generated_at,
                        board.ticker,
                        board.evaluation_window,
                        board.prediction_horizon,
                        board.user_id,
                        board.username,
                        board.avatar_style,
                        board.avatar_seed,
                        board.avatar_options,
                        board.mae,
                        board.mape,
                        board.directional_accuracy,
                        board.scored_count,
                        board.rank
                    from public.dashboard_user_ticker_leaderboard board
                    where exists (
                        select 1
                        from public.user_profiles profile
                        where profile.user_id = board.user_id
                            and profile.is_public = true
                    )
                    order by board.ticker, board.evaluation_window, board.prediction_horizon, board.rank nulls last, board.username
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
                    from public.dashboard_latest_predictions
                    order by prediction_date desc, target_date desc, ticker, model_slug, prediction_horizon
                    limit 5000
                ) row_data
            ), '[]'::jsonb),
        'latestUserPredictions',
            coalesce((
                select jsonb_agg(to_jsonb(row_data))
                from (
                    select
                        prediction.generated_at,
                        prediction.prediction_id,
                        prediction.user_id,
                        prediction.username,
                        prediction.avatar_style,
                        prediction.avatar_seed,
                        prediction.avatar_options,
                        prediction.prediction_date,
                        prediction.target_date,
                        prediction.prediction_horizon,
                        prediction.ticker,
                        prediction.reference_close,
                        prediction.predicted_return,
                        prediction.predicted_close,
                        prediction.hide_details_until_scored
                    from public.dashboard_latest_user_predictions prediction
                    where exists (
                        select 1
                        from public.user_profiles profile
                        where profile.user_id = prediction.user_id
                            and profile.is_public = true
                    )
                    order by prediction.prediction_date desc, prediction.target_date desc, prediction.ticker, prediction.username
                    limit 5000
                ) row_data
            ), '[]'::jsonb),
        'tickerAssets',
            '[]'::jsonb,
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

revoke all on function public.get_public_dashboard_bundle() from public;
grant execute on function public.get_public_dashboard_bundle() to anon, authenticated;
