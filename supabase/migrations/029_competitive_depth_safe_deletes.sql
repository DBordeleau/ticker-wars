create or replace function public.refresh_user_leaderboard_movement()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    delete from public.dashboard_user_leaderboard_movement
    where generated_at is not null;

    with current_rows as (
        select
            board.*,
            profile.is_public
        from public.dashboard_user_leaderboard board
        join public.user_profiles profile on profile.user_id = board.user_id
        where profile.is_public
    ),
    ranked as (
        select
            current_rows.*,
            previous.rank as previous_rank,
            case
                when previous.rank is null then null
                when current_rows.rank is null then null
                else previous.rank - current_rows.rank
            end as rank_delta
        from current_rows
        left join lateral (
            select snapshot.rank
            from public.user_leaderboard_rank_snapshots snapshot
            where snapshot.user_id = current_rows.user_id
              and snapshot.evaluation_window = current_rows.evaluation_window
              and snapshot.prediction_horizon = current_rows.prediction_horizon
              and snapshot.snapshot_date < current_date
              and snapshot.is_public
            order by snapshot.snapshot_date desc
            limit 1
        ) previous on true
    )
    insert into public.dashboard_user_leaderboard_movement (
        generated_at,
        evaluation_window,
        prediction_horizon,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        current_rank,
        previous_rank,
        rank_delta,
        movement_label,
        mae,
        directional_accuracy,
        scored_count
    )
    select
        now(),
        evaluation_window,
        prediction_horizon,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        rank,
        previous_rank,
        rank_delta,
        case
            when previous_rank is null then 'new'
            when rank_delta > 0 then 'up'
            when rank_delta < 0 then 'down'
            else 'steady'
        end,
        mae,
        directional_accuracy,
        scored_count
    from ranked;

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.refresh_nearby_rivals()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    delete from public.dashboard_user_nearby_rivals
    where generated_at is not null;

    with public_board as (
        select board.*
        from public.dashboard_user_leaderboard board
        join public.user_profiles profile on profile.user_id = board.user_id
        where profile.is_public
          and board.rank is not null
    ),
    rival_rows as (
        select
            current_row.generated_at,
            current_row.evaluation_window,
            current_row.prediction_horizon,
            current_row.user_id,
            current_row.username,
            current_row.avatar_style,
            current_row.avatar_seed,
            current_row.avatar_options,
            current_row.mae,
            current_row.directional_accuracy,
            current_row.scored_count,
            current_row.rank,
            'catch'::text as relation,
            rival.user_id as rival_user_id,
            rival.username as rival_username,
            rival.avatar_style as rival_avatar_style,
            rival.avatar_seed as rival_avatar_seed,
            rival.avatar_options as rival_avatar_options,
            rival.mae as rival_mae,
            rival.scored_count as rival_scored_count,
            rival.rank as rival_rank
        from public_board current_row
        join public_board rival
          on rival.evaluation_window = current_row.evaluation_window
         and rival.prediction_horizon = current_row.prediction_horizon
         and rival.rank = current_row.rank - 1
        union all
        select
            current_row.generated_at,
            current_row.evaluation_window,
            current_row.prediction_horizon,
            current_row.user_id,
            current_row.username,
            current_row.avatar_style,
            current_row.avatar_seed,
            current_row.avatar_options,
            current_row.mae,
            current_row.directional_accuracy,
            current_row.scored_count,
            current_row.rank,
            'defend'::text as relation,
            rival.user_id as rival_user_id,
            rival.username as rival_username,
            rival.avatar_style as rival_avatar_style,
            rival.avatar_seed as rival_avatar_seed,
            rival.avatar_options as rival_avatar_options,
            rival.mae as rival_mae,
            rival.scored_count as rival_scored_count,
            rival.rank as rival_rank
        from public_board current_row
        join public_board rival
          on rival.evaluation_window = current_row.evaluation_window
         and rival.prediction_horizon = current_row.prediction_horizon
         and rival.rank = current_row.rank + 1
        union all
        select
            current_row.generated_at,
            current_row.evaluation_window,
            current_row.prediction_horizon,
            current_row.user_id,
            current_row.username,
            current_row.avatar_style,
            current_row.avatar_seed,
            current_row.avatar_options,
            current_row.mae,
            current_row.directional_accuracy,
            current_row.scored_count,
            current_row.rank,
            'podium'::text as relation,
            rival.user_id as rival_user_id,
            rival.username as rival_username,
            rival.avatar_style as rival_avatar_style,
            rival.avatar_seed as rival_avatar_seed,
            rival.avatar_options as rival_avatar_options,
            rival.mae as rival_mae,
            rival.scored_count as rival_scored_count,
            rival.rank as rival_rank
        from public_board current_row
        join public_board rival
          on rival.evaluation_window = current_row.evaluation_window
         and rival.prediction_horizon = current_row.prediction_horizon
         and rival.rank = 3
        where current_row.rank > 3
          and current_row.rank <= 10
    )
    insert into public.dashboard_user_nearby_rivals (
        generated_at,
        evaluation_window,
        prediction_horizon,
        user_id,
        relation,
        user_rank,
        rival_user_id,
        rival_username,
        rival_avatar_style,
        rival_avatar_seed,
        rival_avatar_options,
        rival_rank,
        rank_gap,
        mae_gap,
        scored_count_gap
    )
    select distinct on (user_id, evaluation_window, prediction_horizon, relation)
        now(),
        evaluation_window,
        prediction_horizon,
        user_id,
        relation,
        rank,
        rival_rows.rival_user_id,
        rival_rows.rival_username,
        rival_rows.rival_avatar_style,
        rival_rows.rival_avatar_seed,
        rival_rows.rival_avatar_options,
        rival_rows.rival_rank,
        abs(rank - rival_rows.rival_rank),
        case
            when mae is null or rival_rows.rival_mae is null then null
            else mae - rival_rows.rival_mae
        end,
        scored_count - rival_rows.rival_scored_count
    from rival_rows
    where user_id <> rival_rows.rival_user_id
    order by user_id, evaluation_window, prediction_horizon, relation, abs(rank - rival_rows.rival_rank);

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.refresh_user_ticker_specialties(
    p_min_scored_count integer default 3
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    inserted_count integer;
begin
    delete from public.public_user_ticker_specialties
    where generated_at is not null;

    with scored as (
        select
            score.user_id,
            profile.username,
            profile.avatar_style,
            profile.avatar_seed,
            profile.avatar_options,
            score.ticker,
            count(*)::integer as scored_count,
            avg(score.direction_correct::double precision) as directional_accuracy,
            avg(score.absolute_pct_error) as average_absolute_pct_error,
            count(*) filter (where score.score_verdict = 'called_it')::integer as called_it_count,
            count(*) filter (where score.score_verdict in ('called_it', 'close_call'))::integer as close_call_or_better_count
        from public.user_prediction_scores score
        join public.user_profiles profile on profile.user_id = score.user_id
        where score.xp_awarded > 0
          and profile.is_public
        group by
            score.user_id,
            profile.username,
            profile.avatar_style,
            profile.avatar_seed,
            profile.avatar_options,
            score.ticker
        having count(*) >= greatest(p_min_scored_count, 1)
    ),
    best_scores as (
        select distinct on (score.user_id, score.ticker)
            score.user_id,
            score.ticker,
            score.score_verdict as best_score_verdict,
            score.score_verdict_rank as best_score_verdict_rank
        from public.user_prediction_scores score
        join scored on scored.user_id = score.user_id and scored.ticker = score.ticker
        where score.score_verdict is not null
        order by score.user_id, score.ticker, score.score_verdict_rank nulls last, score.absolute_pct_error
    ),
    ranked as (
        select
            scored.*,
            best_scores.best_score_verdict,
            best_scores.best_score_verdict_rank,
            rank() over (
                partition by scored.ticker
                order by
                    scored.average_absolute_pct_error asc nulls last,
                    scored.directional_accuracy desc nulls last,
                    scored.scored_count desc,
                    scored.username
            ) as ticker_rank
        from scored
        left join best_scores
          on best_scores.user_id = scored.user_id
         and best_scores.ticker = scored.ticker
    )
    insert into public.public_user_ticker_specialties (
        generated_at,
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        ticker,
        scored_count,
        directional_accuracy,
        average_absolute_pct_error,
        best_score_verdict,
        best_score_verdict_rank,
        called_it_count,
        close_call_or_better_count,
        ticker_rank
    )
    select
        now(),
        user_id,
        username,
        avatar_style,
        avatar_seed,
        avatar_options,
        ticker,
        scored_count,
        directional_accuracy,
        average_absolute_pct_error,
        best_score_verdict,
        best_score_verdict_rank,
        called_it_count,
        close_call_or_better_count,
        ticker_rank
    from ranked;

    get diagnostics inserted_count = row_count;
    return inserted_count;
end;
$$;

create or replace function public.refresh_competitive_depth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    snapshot_count integer;
    movement_count integer;
    badge_count integer;
    rival_count integer;
    specialty_count integer;
begin
    snapshot_count := public.snapshot_user_leaderboard_ranks();
    movement_count := public.refresh_user_leaderboard_movement();
    badge_count := public.evaluate_public_competition_badges();
    rival_count := public.refresh_nearby_rivals();
    specialty_count := public.refresh_user_ticker_specialties();

    return jsonb_build_object(
        'snapshots', snapshot_count,
        'movement', movement_count,
        'badges', badge_count,
        'rivals', rival_count,
        'specialties', specialty_count
    );
end;
$$;

grant execute on function public.refresh_user_leaderboard_movement() to service_role;
grant execute on function public.refresh_nearby_rivals() to service_role;
grant execute on function public.refresh_user_ticker_specialties(integer) to service_role;
grant execute on function public.refresh_competitive_depth() to service_role;
