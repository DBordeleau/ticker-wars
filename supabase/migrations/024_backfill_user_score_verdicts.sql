update public.user_prediction_scores
set
    score_verdict = case
        when absolute_pct_error <= 0.01 then 'called_it'
        when absolute_pct_error <= 0.03 then 'close_call'
        when absolute_pct_error <= 0.06 then 'in_the_zone'
        when absolute_pct_error <= 0.10 then 'miss'
        when absolute_pct_error <= 0.20 then 'way_off'
        else 'not_even_close'
    end,
    score_verdict_rank = case
        when absolute_pct_error <= 0.01 then 1
        when absolute_pct_error <= 0.03 then 2
        when absolute_pct_error <= 0.06 then 3
        when absolute_pct_error <= 0.10 then 4
        when absolute_pct_error <= 0.20 then 5
        else 6
    end,
    score_verdict_color = case
        when absolute_pct_error <= 0.01 then 'yellow'
        when absolute_pct_error <= 0.03 then 'green'
        when absolute_pct_error <= 0.06 then 'green'
        when absolute_pct_error <= 0.10 then 'orange'
        when absolute_pct_error <= 0.20 then 'orange'
        else 'red'
    end
where score_verdict is null
    or score_verdict_rank is null
    or score_verdict_color is null;

select public.refresh_public_user_profiles();
