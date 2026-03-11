create extension if not exists pgcrypto;

create table if not exists public.birthdays (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date not null check (birth_date <= current_date),
  area text,
  turno text,
  personal_category text not null
    check (personal_category in ('Policial', 'Civil', 'Gobierno')),
  policial_role text
    check (policial_role in ('Oficial', 'Suboficial', 'Tecnico', 'Civil')),
  oficial_category text,
  suboficial_category text,
  created_at timestamptz not null default now()
);

alter table if exists public.birthdays
  drop constraint if exists birthdays_gobierno_area_turno_check;

alter table if exists public.birthdays
  drop constraint if exists birthdays_policial_role_check;

alter table if exists public.birthdays
  drop constraint if exists birthdays_gobierno_area_turno_check_v1;

alter table if exists public.birthdays
  drop constraint if exists birthdays_policial_role_check_v1;

alter table public.birthdays
  add constraint birthdays_gobierno_area_turno_check_v1 check (
    (
      personal_category = 'Gobierno'
      and area is null
      and turno is null
    )
    or (
      personal_category <> 'Gobierno'
      and area is not null
      and turno is not null
    )
  );

alter table if exists public.birthdays
  drop constraint if exists birthdays_turno_check;

alter table if exists public.birthdays
  drop constraint if exists birthdays_turno_allowed_check;

alter table if exists public.birthdays
  drop constraint if exists birthdays_turno_allowed_check_v1;

alter table public.birthdays
  add constraint birthdays_turno_allowed_check_v1 check (
    turno is null
    or lower(btrim(turno)) in (
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'administrativo',
      'full time',
      'guardia larga',
      'superior de turno'
    )
  ) not valid;

alter table public.birthdays
  add constraint birthdays_policial_role_check_v1 check (
    (
      personal_category = 'Policial'
      and policial_role is not null
    )
    or (
      personal_category <> 'Policial'
      and policial_role is null
    )
  );

create index if not exists birthdays_birth_date_idx
  on public.birthdays (birth_date, last_name, first_name);
