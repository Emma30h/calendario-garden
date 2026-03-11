create extension if not exists pgcrypto;

create table if not exists public.notification_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  run_source text not null default 'scheduled'
    check (run_source in ('scheduled', 'forced')),
  run_timezone text not null default 'America/Argentina/Buenos_Aires',
  status text not null
    check (status in ('running', 'success', 'partial', 'error')),
  total_recipients integer not null default 0
    check (total_recipients >= 0),
  sent_count integer not null default 0
    check (sent_count >= 0),
  error_count integer not null default 0
    check (error_count >= 0),
  total_events integer not null default 0
    check (total_events >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

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

create index if not exists notification_runs_status_run_date_idx
  on public.notification_runs (status, run_date desc);

create unique index if not exists notification_runs_unique_scheduled_per_date_idx
  on public.notification_runs (run_date)
  where run_source = 'scheduled';

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.notification_runs(id) on delete cascade,
  recipient_email text not null,
  status text not null
    check (status in ('sent', 'error')),
  provider text not null default 'brevo',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists notification_deliveries_run_id_idx
  on public.notification_deliveries (run_id);

create index if not exists notification_deliveries_email_created_idx
  on public.notification_deliveries (recipient_email, created_at desc);
