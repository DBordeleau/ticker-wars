drop policy if exists "Allow public dashboard latest prediction reads"
on public.dashboard_latest_predictions;

drop policy if exists "Allow public dashboard leaderboard reads"
on public.dashboard_model_leaderboard;

drop policy if exists "Allow public dashboard ticker history reads"
on public.dashboard_ticker_history;

drop policy if exists "Allow public dashboard model metrics reads"
on public.dashboard_model_metrics;

drop policy if exists "Allow public dashboard metadata reads"
on public.dashboard_run_metadata;

create policy "Allow public dashboard latest prediction reads"
on public.dashboard_latest_predictions
for select
to anon, authenticated
using (true);

create policy "Allow public dashboard leaderboard reads"
on public.dashboard_model_leaderboard
for select
to anon, authenticated
using (true);

create policy "Allow public dashboard ticker history reads"
on public.dashboard_ticker_history
for select
to anon, authenticated
using (true);

create policy "Allow public dashboard model metrics reads"
on public.dashboard_model_metrics
for select
to anon, authenticated
using (true);

create policy "Allow public dashboard metadata reads"
on public.dashboard_run_metadata
for select
to anon, authenticated
using (true);
