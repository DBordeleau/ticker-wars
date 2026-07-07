alter table if exists public.fundamentals
    add column if not exists long_name text,
    add column if not exists short_name text,
    add column if not exists display_name text,
    add column if not exists business_summary text,
    add column if not exists website text;

alter table if exists public.fundamentals
    alter column raw_json drop not null;

update public.fundamentals
set
    long_name = coalesce(long_name, nullif(btrim(raw_json->>'longName'), '')),
    short_name = coalesce(short_name, nullif(btrim(raw_json->>'shortName'), '')),
    display_name = coalesce(display_name, nullif(btrim(raw_json->>'displayName'), '')),
    business_summary = coalesce(
        business_summary,
        nullif(btrim(raw_json->>'longBusinessSummary'), '')
    ),
    website = coalesce(
        website,
        nullif(
            btrim(
                coalesce(
                    raw_json->>'website',
                    raw_json->>'websiteUrl',
                    raw_json->>'website_url'
                )
            ),
            ''
        )
    )
where raw_json is not null;

delete from public.fundamentals older
using public.fundamentals newer
where older.ticker = newer.ticker
  and older.as_of_date < newer.as_of_date;

update public.fundamentals
set raw_json = null
where raw_json is not null;
