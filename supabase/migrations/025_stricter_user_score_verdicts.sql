with scored as (
    select
        prediction_id,
        prediction_horizon,
        direction_correct,
        case
            when prediction_horizon = '1w' and absolute_pct_error <= 0.005 then 1
            when prediction_horizon = '1w' and absolute_pct_error <= 0.015 then 2
            when prediction_horizon = '1w' and absolute_pct_error <= 0.03 then 3
            when prediction_horizon = '1w' and absolute_pct_error <= 0.06 then 4
            when prediction_horizon = '1w' and absolute_pct_error <= 0.12 then 5
            when prediction_horizon = '1w' then 6
            when prediction_horizon = '3m' and absolute_pct_error <= 0.01 then 1
            when prediction_horizon = '3m' and absolute_pct_error <= 0.03 then 2
            when prediction_horizon = '3m' and absolute_pct_error <= 0.06 then 3
            when prediction_horizon = '3m' and absolute_pct_error <= 0.12 then 4
            when prediction_horizon = '3m' and absolute_pct_error <= 0.24 then 5
            when prediction_horizon = '3m' then 6
            when prediction_horizon = '1y' and absolute_pct_error <= 0.015 then 1
            when prediction_horizon = '1y' and absolute_pct_error <= 0.04 then 2
            when prediction_horizon = '1y' and absolute_pct_error <= 0.08 then 3
            when prediction_horizon = '1y' and absolute_pct_error <= 0.16 then 4
            when prediction_horizon = '1y' and absolute_pct_error <= 0.32 then 5
            when prediction_horizon = '1y' then 6
            when absolute_pct_error <= 0.0075 then 1
            when absolute_pct_error <= 0.025 then 2
            when absolute_pct_error <= 0.05 then 3
            when absolute_pct_error <= 0.09 then 4
            when absolute_pct_error <= 0.18 then 5
            else 6
        end as base_rank
    from public.user_prediction_scores
),
ranked as (
    select
        prediction_id,
        case
            when direction_correct <> 1 and prediction_horizon = '1w'
                then greatest(least(base_rank + 1, 6), 4)
            when direction_correct <> 1
                then least(base_rank + 1, 6)
            else base_rank
        end as verdict_rank
    from scored
)
update public.user_prediction_scores score
set
    score_verdict = case ranked.verdict_rank
        when 1 then 'called_it'
        when 2 then 'close_call'
        when 3 then 'in_the_zone'
        when 4 then 'miss'
        when 5 then 'way_off'
        else 'not_even_close'
    end,
    score_verdict_rank = ranked.verdict_rank,
    score_verdict_color = case ranked.verdict_rank
        when 1 then 'yellow'
        when 2 then 'green'
        when 3 then 'green'
        when 4 then 'orange'
        when 5 then 'orange'
        else 'red'
    end
from ranked
where ranked.prediction_id = score.prediction_id;

select public.refresh_public_user_profiles();
