create or replace function public.record_user_prediction_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_revision_number integer;
begin
    if old.predicted_close is not distinct from new.predicted_close
        and old.reference_close is not distinct from new.reference_close
        and old.prediction_date is not distinct from new.prediction_date
        and old.target_date is not distinct from new.target_date
        and old.prediction_horizon is not distinct from new.prediction_horizon
    then
        return new;
    end if;

    select coalesce(max(revision_number), 0) + 1
    into next_revision_number
    from public.user_prediction_revisions
    where prediction_id = old.prediction_id;

    insert into public.user_prediction_revisions (
        prediction_id,
        user_id,
        revision_number,
        prediction_date,
        target_date,
        prediction_horizon,
        reference_close,
        predicted_close,
        predicted_return
    )
    values (
        old.prediction_id,
        old.user_id,
        next_revision_number,
        old.prediction_date,
        old.target_date,
        old.prediction_horizon,
        old.reference_close,
        old.predicted_close,
        old.predicted_return
    );

    return new;
end;
$$;

drop trigger if exists record_user_prediction_revision on public.user_predictions;

create trigger record_user_prediction_revision
before update on public.user_predictions
for each row
execute function public.record_user_prediction_revision();
