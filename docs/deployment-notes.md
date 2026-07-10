# Deployment Notes

These notes document how the private production project is operated. They are intentionally
separate from the README so the public portfolio repo reads like a case study instead of a
deployment manual.

## Public Repository Strategy

The final public repository is intended to be `ticker-wars`. The private operational repository can
remain attached to production Supabase, Vercel, and scheduled GitHub Actions unless there is a
deliberate reason to move automation public.

If publishing a fresh public repo, add public-safe CI for:

- Python tests
- Ruff linting
- frontend tests
- frontend production build

## GitHub Actions

The private repo currently includes:

- `daily-pipeline.yml`: scheduled/manual backend pipeline run.
- `live-price-refresh.yml`: manual fallback repair workflow for live price refreshes.

Secrets such as Supabase service credentials, LLM keys, Hugging Face tokens, and deployment tokens
must stay in private GitHub/Vercel/Supabase secret stores.

## Vercel

The React app can be deployed as a standard Create React App build:

```bash
cd frontend
npm run build
```

The frontend should receive only public-safe values:

```text
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_PUBLISHABLE_KEY=...
REACT_APP_SITE_URL=https://tickerwars.vercel.app
```

## Supabase Live Price Refresh

Regular-session live prices are refreshed by the Supabase Edge Function at
`supabase/functions/refresh-live-prices`. The function uses Yahoo's free multi-symbol Spark
endpoint to refresh the compact `live_price_snapshots` table during the market-hours window.

Deploy the function with the Supabase CLI:

```bash
npx supabase@latest functions deploy refresh-live-prices --project-ref <project-ref>
```

The function is configured in `supabase/config.toml` with JWT verification enabled. Cron callers
should use a service-role JWT stored in Supabase Vault or another private secret store.

Before applying the live-price schedule migration, enable Vault and create placeholder-backed
secrets in the Supabase SQL editor:

```sql
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/refresh-live-prices',
  'live_price_refresh_url'
);

select vault.create_secret(
  '<supabase-service-role-key>',
  'live_price_refresh_service_role_key'
);
```

The scheduled migration runs the function during a broad weekday UTC window. The Edge Function
itself enforces exact NYSE trading days and regular market hours.

## Publication Safety

Before making a public copy:

- Rotate any production secrets that may have been used during development.
- Run a current-tree secret scan.
- Run a history-aware secret scan if preserving commit history.
- Confirm `.env`, generated exports, caches, local virtual environments, and build output are not
  committed.
- Confirm screenshots, sample exports, and docs do not expose real private user data.
