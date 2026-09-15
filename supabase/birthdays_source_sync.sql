-- Vincula public.birthdays con los legajos reales de Perfiles Garden
-- (gestion_personal.agentes, mismo proyecto de Supabase). Ver
-- src/lib/perfiles-garden-sync.ts para el motor de sincronizacion y
-- src/app/api/birthdays/sync/route.ts para el endpoint que la dispara.
--
-- source = 'MANUAL': fila cargada a mano desde /anual/personal-cargado (comportamiento actual).
-- source = 'PERFILES_GARDEN': fila generada por el sync, de solo lectura en la UI.
-- source_agente_id: id del Agente en Perfiles Garden (gestion_personal.agentes.id),
--   solo se completa para filas sincronizadas. Es la clave de upsert/borrado del sync.

alter table public.birthdays
  add column if not exists source text not null default 'MANUAL',
  add column if not exists source_agente_id text,
  add column if not exists synced_at timestamptz;

alter table if exists public.birthdays
  drop constraint if exists birthdays_source_check;

alter table public.birthdays
  add constraint birthdays_source_check check (
    source in ('MANUAL', 'PERFILES_GARDEN')
  );

-- PostgREST/Postgres solo puede resolver ON CONFLICT (source_agente_id) contra
-- una constraint unica real (un indice unico parcial no alcanza para la
-- inferencia de ON CONFLICT sin WHERE). NULL no colisiona con NULL bajo una
-- unique constraint normal, asi que las filas MANUAL (source_agente_id NULL)
-- no se ven afectadas.
drop index if exists public.birthdays_source_agente_id_key;

alter table if exists public.birthdays
  drop constraint if exists birthdays_source_agente_id_key;

alter table public.birthdays
  add constraint birthdays_source_agente_id_key unique (source_agente_id);
