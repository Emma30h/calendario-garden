create extension if not exists pgcrypto;

create table if not exists public.email_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint email_recipients_email_format_check
    check (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$')
);

create index if not exists email_recipients_active_created_idx
  on public.email_recipients (is_active, created_at desc);
