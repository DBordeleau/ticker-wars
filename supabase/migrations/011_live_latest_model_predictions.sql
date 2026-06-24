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

create or replace function public.refresh_dashboard_latest_predictions_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    perform public.refresh_dashboard_latest_predictions();
    return null;
end;
$$;

drop trigger if exists refresh_latest_predictions_on_prediction_change
on public.predictions;

create trigger refresh_latest_predictions_on_prediction_change
after insert or update or delete on public.predictions
for each statement
execute function public.refresh_dashboard_latest_predictions_trigger();

select public.refresh_dashboard_latest_predictions();
