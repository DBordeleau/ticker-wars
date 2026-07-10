# Publication Checklist

This checklist tracks the work required before publishing the cleaned portfolio
edition of Ticker Wars in a public GitHub repository named `ticker-wars`.

The current private repository can remain the operational source of truth for
the scheduled pipeline, production deploys, and private Supabase automation.
The public repository should be the readable portfolio artifact: source code,
tests, curated schema/docs, and a recruiter-facing README.

## Public Repo Strategy

- Create the public repository as `ticker-wars`.
- Prefer a fresh public repo or orphan public branch with a clean initial
  commit.
- Keep the private repo history private if it contains noisy migration churn,
  local planning notes, or operational details that do not help reviewers.
- Keep production Supabase and Vercel automation attached to the private repo
  unless there is a deliberate reason to move operations public.
- Keep public-safe CI in `ticker-wars` for Python tests, Ruff linting,
  frontend tests, and frontend build checks.

## No-Regression Rule

Cleanup PRs should not change user-facing app behavior unless a PR explicitly
states otherwise. Preserve:

- Routes and navigation behavior.
- Landing page, dashboard, ticker pages, model pages, auth pages, and prediction
  flows.
- Supabase read/write contracts used by the frontend and pipeline.
- CLI command names, flags, defaults, logging, and side effects.
- Forecasting, scoring, leaderboard, and dashboard projection semantics.

## Safety Checks

- Rotate production secrets before publication.
- Run a current-tree secret scan before every public push.
- If keeping history, run a history-aware secret scan.
- Confirm `.env`, `.env.*`, `frontend/.env.local`, generated exports, caches,
  local virtual environments, and build output are not committed.
- Confirm no real user data or private operational notes are included.
- Confirm screenshots or sample exports do not reveal private data.

## Public Tree Should Include

- `README.md` written as a portfolio case study.
- `LICENSE`.
- `SECURITY.md`.
- Source code for the Python pipeline and React frontend.
- Tests that demonstrate the important contracts.
- Curated Supabase schema and database documentation.
- Public-safe GitHub Actions for validation.
- `env.example` files that show required configuration without secrets.
- Sanitized screenshots or demo media, if used.

## Public Tree Should Exclude

- Local `.env` files.
- Supabase service role keys, LLM provider keys, Hugging Face tokens, Vercel
  tokens, or any write-capable automation credentials.
- Generated runtime exports unless intentionally sanitized.
- Local planning archives that are not useful to reviewers.
- Secret scanner reports that contain sensitive paths or findings.
- Historical migrations, because the public repo replaces them with a curated
  schema.

## PR Sequence

1. Repo hygiene, safety audit, and public-readiness scaffolding.
2. Supabase schema curation and database documentation.
3. CSS split with no visual changes.
4. Frontend dashboard data API split with no contract changes.
5. Chart component split with no visual changes.
6. Backend CLI split with no command behavior changes.
7. Recruiter-facing README and portfolio docs rewrite.
8. Public edition packaging and final verification.

## Final Verification

From a clean clone or clean copy, run:

```bash
python -m pip install -e ".[dev]"
python -m pytest
cd frontend
npm install
npm test -- --watchAll=false
npm run build
```

Then manually check the landing page, dashboard, ticker detail page, model
detail page, prediction UI, auth boundaries, and mobile viewport.
