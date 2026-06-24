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
        predicted_close
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
        prediction.predicted_return,
        prediction.predicted_close
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

create or replace function public.refresh_dashboard_latest_predictions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.dashboard_latest_predictions
    where generated_at is not null;

    insert into public.dashboard_latest_predictions (
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
    )
    select
        now(),
        latest.prediction_id,
        latest.prediction_date,
        latest.target_date,
        latest.prediction_horizon,
        latest.ticker,
        latest.model_name,
        latest.model_slug,
        latest.reference_close,
        latest.predicted_return,
        latest.predicted_close,
        latest.predicted_close_lower,
        latest.predicted_close_upper,
        latest.interval_level,
        latest.reasoning_summary,
        latest.model_metadata
    from (
        select distinct on (prediction.ticker, prediction.model_slug, prediction.prediction_horizon)
            prediction.*
        from public.predictions prediction
        order by
            prediction.ticker,
            prediction.model_slug,
            prediction.prediction_horizon,
            prediction.prediction_date desc,
            prediction.target_date desc
    ) latest
    order by latest.ticker, latest.model_name, latest.prediction_horizon;
end;
$$;

select public.refresh_dashboard_latest_user_predictions();
select public.refresh_dashboard_latest_predictions();
