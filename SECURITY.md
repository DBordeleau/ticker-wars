# Security Policy

Ticker Wars is a portfolio project, not a financial product or production
trading system. Please do not use public issues for sensitive security reports.

## Reporting A Vulnerability

If you find a vulnerability, leaked credential, or privacy issue:

1. Report it privately through GitHub Security Advisories if available.
2. Include the affected file, route, workflow, or configuration.
3. Include enough reproduction detail to validate the issue without exposing
   additional secrets or private data.

I will review valid reports as soon as practical and will prioritize issues
that could expose credentials, user data, or backend write access.

## Secrets And Keys

The React application should only use publishable Supabase configuration. Any
Supabase service role key, model provider key, or write-capable automation token
belongs only in trusted backend environments such as GitHub Actions secrets,
Supabase Vault, Vercel environment variables, or a local `.env` file that is not
committed.

## Financial Disclaimer

This project is not financial advice, a trading strategy, or a production
prediction system.
