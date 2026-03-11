alter table if exists public.notification_runs
  add column if not exists run_source text;

update public.notification_runs
set run_source = 'scheduled'
where run_source is null;

alter table public.notification_runs
  alter column run_source set default 'scheduled';

alter table public.notification_runs
  alter column run_source set not null;

alter table if exists public.notification_runs
  drop constraint if exists notification_runs_run_date_key;

alter table if exists public.notification_runs
  drop constraint if exists notification_runs_run_source_check;

alter table public.notification_runs
  add constraint notification_runs_run_source_check
  check (run_source in ('scheduled', 'forced'));

create unique index if not exists notification_runs_unique_scheduled_per_date_idx
  on public.notification_runs (run_date)
  where run_source = 'scheduled';

