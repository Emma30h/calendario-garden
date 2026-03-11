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
