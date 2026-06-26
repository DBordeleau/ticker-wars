-- 015_dashboard_user_prediction_count.sql
-- Adds a total user-prediction count to dashboard run metadata.
--
-- The landing page status strip shows a "user predictions" total. The
-- dashboard_latest_user_predictions feed is a bounded recent feed and cannot
-- provide a true total, so refresh-dashboard now publishes the real count here
-- alongside the existing model `prediction_count`.
--
-- Idempotent: safe to run more than once.

alter table public.dashboard_run_metadata
    add column if not exists user_prediction_count integer not null default 0;
