# Deployment Notes

These notes document how the private production project is operated. They are intentionally
separate from the README so the public portfolio repo reads like a case study instead of a
deployment manual.

## Public Repository Strategy

The final public repository is intended to be `ticker-wars`. The public edition keeps validation
CI only. Production Supabase, Vercel, scheduled pipeline automation, and migration runbooks should
remain private unless there is a deliberate reason to move operations public.

The public CI should cover:

- Python tests
- Ruff linting
- frontend tests
- frontend production build

## GitHub Actions

The public repo includes `.github/workflows/ci.yml`, which needs no production secrets.

The private operational project may keep separate workflows for:

- scheduled/manual backend pipeline runs
- manual fallback repair workflow for live price refreshes

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
should use private Supabase/Vault-managed credentials. The private schedule should run the
function during a broad weekday UTC window. The Edge Function itself enforces exact NYSE trading
days and regular market hours.

## Publication Safety

Before making a public copy:

- Rotate any production secrets that may have been used during development.
- Run a current-tree secret scan.
- Run a history-aware secret scan if preserving commit history.
- Confirm `.env`, generated exports, caches, local virtual environments, and build output are not
  committed.
- Confirm screenshots, sample exports, and docs do not expose real private user data.
