create index if not exists prediction_scores_model_window_idx
on public.prediction_scores (model_slug, prediction_horizon, scored_at desc);

create or replace function public.get_public_model_scored_predictions(
    p_model_slug text,
    p_evaluation_window text,
    p_prediction_horizon text,
    p_limit integer default 50,
    p_offset integer default 0
)
returns table (
    prediction_id text,
    ticker text,
    prediction_date date,
    target_date date,
    prediction_horizon text,
    model_name text,
    model_slug text,
    reference_close double precision,
    predicted_return double precision,
    predicted_close double precision,
    predicted_close_lower double precision,
    predicted_close_upper double precision,
    interval_level double precision,
    actual_close double precision,
    actual_return double precision,
    absolute_error double precision,
    absolute_pct_error double precision,
    predicted_direction integer,
    actual_direction integer,
    direction_correct integer,
    interval_hit boolean,
    interval_width double precision,
    interval_width_pct double precision,
    winkler_score double precision,
    scored_at timestamptz,
    total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
    with model_latest as (
        select max(score.scored_at) as latest_scored_at
        from public.prediction_scores score
    ),
    filtered as (
        select
            prediction.prediction_id,
            prediction.ticker,
            prediction.prediction_date,
            prediction.target_date,
            prediction.prediction_horizon,
            prediction.model_name,
            prediction.model_slug,
            prediction.reference_close,
            prediction.predicted_return,
            prediction.predicted_close,
            prediction.predicted_close_lower,
            prediction.predicted_close_upper,
            prediction.interval_level,
            score.actual_close,
            score.actual_return,
            score.absolute_error,
            score.absolute_pct_error,
            score.predicted_direction,
            score.actual_direction,
            score.direction_correct,
            score.interval_hit,
            score.interval_width,
            score.interval_width_pct,
            score.winkler_score,
            score.scored_at
        from public.prediction_scores score
        join public.predictions prediction
            on prediction.prediction_id = score.prediction_id
        cross join model_latest
        where score.model_slug = trim(p_model_slug)
            and (
                p_prediction_horizon = 'all'
                or score.prediction_horizon = p_prediction_horizon
            )
            and (
                p_evaluation_window = 'all'
                or score.scored_at >= model_latest.latest_scored_at
                    - ((replace(p_evaluation_window, 'd', '')::integer - 1) * interval '1 day')
            )
    ),
    counted as (
        select filtered.*, count(*) over () as total_count
        from filtered
    )
    select *
    from counted
    order by scored_at desc, target_date desc, prediction_date desc, ticker
    limit greatest(1, least(coalesce(p_limit, 50), 100))
    offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.get_public_model_scored_predictions(text, text, text, integer, integer)
from public;
grant execute on function public.get_public_model_scored_predictions(text, text, text, integer, integer)
to anon, authenticated;
