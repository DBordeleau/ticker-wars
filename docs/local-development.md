# Local Development

This guide is for reviewers who want to run tests or start the React app locally. It is not a
production deployment guide.

## Requirements

- Python 3.11 or newer
- Node.js and npm
- Optional Supabase project credentials if you want live dashboard data

## Backend Setup

Install the Python package and development dependencies:

```bash
python -m pip install -e ".[dev]"
```

Create a local environment file:

```bash
cp .env.example .env
```

The pipeline can import and run tests without Supabase credentials. Commands that write to the
database skip work when backend Supabase credentials are not configured.

## Frontend Setup

Install dependencies:

```bash
cd frontend
npm install
```

For live Supabase reads, create `frontend/.env.local`:

```text
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
REACT_APP_SITE_URL=https://tickerwars.vercel.app
```

Then start the app:

```bash
npm start
```

## Validation

Backend:

```bash
python -m pytest
python -m ruff check .
```

Frontend:

```bash
cd frontend
npm test -- --watchAll=false
npm run build
```

## Optional Model Dependencies

TimesFM and Chronos-2 are optional adapters. Install them only if you intend to run those model
paths locally:

```bash
python -m pip install -e ".[timesfm]"
python -m pip install -e ".[chronos]"
```

Set the corresponding feature flags in `.env` before running prediction commands:

```text
TIMESFM_ENABLED=true
CHRONOS_ENABLED=true
```
