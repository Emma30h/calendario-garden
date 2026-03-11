create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  status text not null
    check (status in ('pending_verification', 'active', 'disabled')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table if exists public.users
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists personal_type text,
  add column if not exists hierarchy text,
  add column if not exists area text;

alter table if exists public.users
  drop constraint if exists users_personal_type_check;

alter table if exists public.users
  add constraint users_personal_type_check
  check (
    personal_type is null
    or personal_type in ('Oficial', 'Suboficial', 'Tecnico', 'Civil')
  );

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'CLIENTE')),
  client_id uuid references public.clients(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table if exists public.user_roles
  add column if not exists id uuid default gen_random_uuid();

update public.user_roles
set id = gen_random_uuid()
where id is null;

alter table if exists public.user_roles
  alter column id set not null;

alter table if exists public.user_roles
  drop constraint if exists user_roles_pkey;

alter table if exists public.user_roles
  add constraint user_roles_pkey primary key (id);

alter table if exists public.user_roles
  alter column client_id drop not null;

create unique index if not exists user_roles_unique_global_idx
  on public.user_roles (user_id, role)
  where client_id is null;

create unique index if not exists user_roles_unique_client_idx
  on public.user_roles (user_id, role, client_id)
  where client_id is not null;

create index if not exists user_roles_user_id_idx
  on public.user_roles (user_id, created_at);

create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  consumed_at timestamptz,
  sent_count integer not null default 1 check (sent_count >= 1),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists email_verification_codes_user_created_idx
  on public.email_verification_codes (user_id, created_at desc);

create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  consumed_at timestamptz,
  sent_count integer not null default 1 check (sent_count >= 1),
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists password_reset_codes_user_created_idx
  on public.password_reset_codes (user_id, created_at desc);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  resource text not null,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_action_resource_created_idx
  on public.audit_logs (action, resource, created_at desc);
