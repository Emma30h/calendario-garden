create extension if not exists pgcrypto;

create table if not exists public.efemerides (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  month integer not null
    check (month >= 1 and month <= 12),
  year integer not null
    check (year >= 1900 and year <= 3000),
  imported_at timestamptz not null default now(),
  events jsonb not null
    check (jsonb_typeof(events) = 'array'),
  event_count integer not null
    check (event_count >= 0),
  created_at timestamptz not null default now(),
  constraint efemerides_year_month_unique unique (year, month)
);

create index if not exists efemerides_imported_at_idx
  on public.efemerides (imported_at desc);
