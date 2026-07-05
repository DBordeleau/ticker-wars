with latest as (
    select max(scored_at) as scored_at
    from public.prediction_scores
),
metrics as (
    select
        board.evaluation_window,
        board.prediction_horizon,
        board.model_slug,
        avg(score.absolute_pct_error) as mape
    from public.dashboard_model_leaderboard board
    join public.prediction_scores score
      on score.model_slug = board.model_slug
     and (
        board.prediction_horizon = 'all'
        or score.prediction_horizon = board.prediction_horizon
     )
    cross join latest
    where score.scored_at >= case
        when board.evaluation_window = 'all' then '-infinity'::timestamptz
        else latest.scored_at - ((replace(board.evaluation_window, 'd', '')::integer - 1) * interval '1 day')
    end
    group by board.evaluation_window, board.prediction_horizon, board.model_slug
)
update public.dashboard_model_leaderboard board
set mape = metrics.mape
from metrics
where board.evaluation_window = metrics.evaluation_window
  and board.prediction_horizon = metrics.prediction_horizon
  and board.model_slug = metrics.model_slug;

with latest as (
    select max(scored_at) as scored_at
    from public.prediction_scores
),
metrics as (
    select
        board.evaluation_window,
        board.prediction_horizon,
        board.model_slug,
        avg(score.absolute_pct_error) as mape
    from public.dashboard_model_metrics board
    join public.prediction_scores score
      on score.model_slug = board.model_slug
     and (
        board.prediction_horizon = 'all'
        or score.prediction_horizon = board.prediction_horizon
     )
    cross join latest
    where score.scored_at >= case
        when board.evaluation_window = 'all' then '-infinity'::timestamptz
        else latest.scored_at - ((replace(board.evaluation_window, 'd', '')::integer - 1) * interval '1 day')
    end
    group by board.evaluation_window, board.prediction_horizon, board.model_slug
)
update public.dashboard_model_metrics board
set mape = metrics.mape
from metrics
where board.evaluation_window = metrics.evaluation_window
  and board.prediction_horizon = metrics.prediction_horizon
  and board.model_slug = metrics.model_slug;

with public_users as (
    select distinct user_id
    from public.dashboard_user_leaderboard
),
latest as (
    select max(score.scored_at) as scored_at
    from public.user_prediction_scores score
    join public_users public_user
      on public_user.user_id = score.user_id
),
metrics as (
    select
        board.evaluation_window,
        board.prediction_horizon,
        board.user_id,
        avg(score.absolute_pct_error) as mape
    from public.dashboard_user_leaderboard board
    join public.user_prediction_scores score
      on score.user_id = board.user_id
     and (
        board.prediction_horizon = 'all'
        or score.prediction_horizon = board.prediction_horizon
     )
    cross join latest
    where score.scored_at >= case
        when board.evaluation_window = 'all' then '-infinity'::timestamptz
        else latest.scored_at - ((replace(board.evaluation_window, 'd', '')::integer - 1) * interval '1 day')
    end
    group by board.evaluation_window, board.prediction_horizon, board.user_id
)
update public.dashboard_user_leaderboard board
set mape = metrics.mape
from metrics
where board.evaluation_window = metrics.evaluation_window
  and board.prediction_horizon = metrics.prediction_horizon
  and board.user_id = metrics.user_id;

do $$
begin
    if to_regclass('public.dashboard_user_ticker_leaderboard') is not null then
        with public_users as (
            select distinct user_id
            from public.dashboard_user_ticker_leaderboard
        ),
        latest as (
            select max(score.scored_at) as scored_at
            from public.user_prediction_scores score
            join public_users public_user
              on public_user.user_id = score.user_id
        ),
        metrics as (
            select
                board.ticker,
                board.evaluation_window,
                board.prediction_horizon,
                board.user_id,
                avg(score.absolute_pct_error) as mape
            from public.dashboard_user_ticker_leaderboard board
            join public.user_prediction_scores score
              on score.user_id = board.user_id
             and score.ticker = board.ticker
             and (
                board.prediction_horizon = 'all'
                or score.prediction_horizon = board.prediction_horizon
             )
            cross join latest
            where score.scored_at >= case
                when board.evaluation_window = 'all' then '-infinity'::timestamptz
                else latest.scored_at - ((replace(board.evaluation_window, 'd', '')::integer - 1) * interval '1 day')
            end
            group by board.ticker, board.evaluation_window, board.prediction_horizon, board.user_id
        )
        update public.dashboard_user_ticker_leaderboard board
        set mape = metrics.mape
        from metrics
        where board.ticker = metrics.ticker
          and board.evaluation_window = metrics.evaluation_window
          and board.prediction_horizon = metrics.prediction_horizon
          and board.user_id = metrics.user_id;
    end if;
end $$;
