create or replace function public.delete_user_account_data(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    deleted_counts jsonb := '{}'::jsonb;
    deleted_count integer;
begin
    if target_user_id is null then
        raise exception 'target_user_id is required';
    end if;

    perform pg_advisory_xact_lock(
        ('x' || substr(md5(target_user_id::text), 1, 16))::bit(64)::bigint
    );

    delete from public.dashboard_latest_user_predictions
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{dashboard_latest_user_predictions}', to_jsonb(deleted_count), true);

    delete from public.dashboard_user_leaderboard
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{dashboard_user_leaderboard}', to_jsonb(deleted_count), true);

    delete from public.dashboard_user_ticker_leaderboard
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{dashboard_user_ticker_leaderboard}', to_jsonb(deleted_count), true);

    delete from public.dashboard_user_leaderboard_movement
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{dashboard_user_leaderboard_movement}', to_jsonb(deleted_count), true);

    delete from public.dashboard_user_nearby_rivals
    where user_id = target_user_id or rival_user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{dashboard_user_nearby_rivals}', to_jsonb(deleted_count), true);

    delete from public.user_leaderboard_rank_snapshots
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_leaderboard_rank_snapshots}', to_jsonb(deleted_count), true);

    delete from public.public_user_profile_predictions
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{public_user_profile_predictions}', to_jsonb(deleted_count), true);

    delete from public.public_user_badges
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{public_user_badges}', to_jsonb(deleted_count), true);

    delete from public.public_user_ticker_specialties
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{public_user_ticker_specialties}', to_jsonb(deleted_count), true);

    delete from public.public_user_profiles
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{public_user_profiles}', to_jsonb(deleted_count), true);

    delete from public.user_engagement_events
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_engagement_events}', to_jsonb(deleted_count), true);

    delete from public.user_badges
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_badges}', to_jsonb(deleted_count), true);

    delete from public.user_xp_events
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_xp_events}', to_jsonb(deleted_count), true);

    delete from public.user_progression
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_progression}', to_jsonb(deleted_count), true);

    delete from public.user_prediction_revisions
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_prediction_revisions}', to_jsonb(deleted_count), true);

    delete from public.user_prediction_scores
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_prediction_scores}', to_jsonb(deleted_count), true);

    delete from public.user_predictions
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_predictions}', to_jsonb(deleted_count), true);

    delete from public.user_profiles
    where user_id = target_user_id;
    get diagnostics deleted_count = row_count;
    deleted_counts := jsonb_set(deleted_counts, '{user_profiles}', to_jsonb(deleted_count), true);

    return deleted_counts;
end;
$$;

revoke all on function public.delete_user_account_data(uuid) from public;
revoke all on function public.delete_user_account_data(uuid) from anon;
revoke all on function public.delete_user_account_data(uuid) from authenticated;
grant execute on function public.delete_user_account_data(uuid) to service_role;
