create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.compact_model_prediction_id(
    p_ticker text,
    p_prediction_date date,
    p_target_date date,
    p_prediction_horizon text,
    p_model_slug text
)
returns text
language sql
immutable
set search_path = public, extensions, pg_catalog
as $$
    select substr(
        encode(
            digest(
                convert_to(
                    concat_ws(
                        '|',
                        p_ticker,
                        p_prediction_date::text,
                        p_target_date::text,
                        p_prediction_horizon,
                        p_model_slug
                    ),
                    'UTF8'
                ),
                'sha256'
            ),
            'hex'
        ),
        1,
        32
    );
$$;

alter table public.prediction_scores
    drop constraint if exists prediction_scores_prediction_id_fkey,
    add constraint prediction_scores_prediction_id_fkey
        foreign key (prediction_id)
        references public.predictions(prediction_id)
        on update cascade
        on delete cascade;

update public.predictions
set prediction_id = public.compact_model_prediction_id(
    ticker,
    prediction_date,
    target_date,
    prediction_horizon,
    model_slug
)
where prediction_id <> public.compact_model_prediction_id(
    ticker,
    prediction_date,
    target_date,
    prediction_horizon,
    model_slug
);
