alter table public.public_user_profiles
add column if not exists verdict_counts jsonb not null default '{}'::jsonb;

create or replace function public.set_public_user_profile_verdict_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.verdict_counts = coalesce(
        (
            select jsonb_object_agg(counts.score_verdict, counts.verdict_count)
            from (
                select
                    score.score_verdict,
                    count(*)::integer as verdict_count
                from public.user_prediction_scores score
                where score.user_id = new.user_id
                    and score.score_verdict is not null
                group by score.score_verdict
            ) counts
        ),
        '{}'::jsonb
    );

    return new;
end;
$$;

drop trigger if exists set_public_user_profile_verdict_counts
on public.public_user_profiles;

create trigger set_public_user_profile_verdict_counts
before insert or update
on public.public_user_profiles
for each row
execute function public.set_public_user_profile_verdict_counts();

update public.public_user_profiles
set updated_at = updated_at;
