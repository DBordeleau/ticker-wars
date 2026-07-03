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
    perform set_config('safeupdate.enabled', '0', true);

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

grant execute on function public.refresh_competitive_depth() to service_role;
