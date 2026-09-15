import {
  asIsoDateString,
  isFutureDate,
  sanitizePersonName,
  type BirthdayInsertPayload,
  type PersonalCategory,
  type PolicialRole,
} from "@/app/api/birthdays/route";
import { queryPerfilesGarden } from "@/lib/perfiles-garden-db";
import { readSupabaseErrorMessage, supabaseRestFetch } from "@/lib/supabase-rest";

// Motor de sincronizacion unidireccional: gestion_personal.agentes (Perfiles
// Garden, fuente de verdad del legajo) -> public.birthdays (Calendario
// Garden). Ver supabase/birthdays_source_sync.sql para las columnas
// source/source_agente_id/synced_at que esto usa, y
// src/app/api/birthdays/sync/route.ts para el endpoint que lo dispara.
//
// Reglas: solo agentes con estado ACTIVO y fechaNacimiento cargada. Los que
// no se pueden mapear a un birthdays valido (falta rango, area o turno no
// reconocido) se excluyen y se reportan en `skipped` para carga manual, en
// vez de romper el sync entero.

const ALLOWED_TURNOS = new Set([
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "administrativo",
  "full time",
  "guardia larga",
  "superior de turno",
]);

type AgenteRow = {
  id: string;
  nombres: string | null;
  apellidos: string | null;
  birth_date: string | null;
  tipoPersonal: string | null;
  origenInstitucional: string | null;
  turno: string | null;
  sectorId: string | null;
  rango_cuerpo: string | null;
  rango_nombre: string | null;
};

type SectorRow = {
  id: string;
  nombre: string;
  tipo: string;
  padreId: string | null;
};

export type SkippedAgente = {
  agenteId: string;
  nombre: string;
  motivo: string;
};

export type SyncSummary = {
  upserted: number;
  deleted: number;
  skipped: SkippedAgente[];
};

async function fetchAgentes() {
  const result = await queryPerfilesGarden<AgenteRow>(
    `select
       a.id,
       a.nombres,
       a.apellidos,
       to_char(a."fechaNacimiento", 'YYYY-MM-DD') as birth_date,
       a."tipoPersonal",
       a."origenInstitucional",
       a.turno,
       a."sectorId",
       r.cuerpo as rango_cuerpo,
       r.nombre as rango_nombre
     from gestion_personal.agentes a
     left join gestion_personal.rangos r on r.id = a."rangoId"
     where a.estado = 'ACTIVO' and a."fechaNacimiento" is not null`
  );
  return result.rows;
}

async function fetchSectores() {
  const result = await queryPerfilesGarden<SectorRow>(
    `select id, nombre, tipo, "padreId" from gestion_personal.sectores`
  );
  return result.rows;
}

// Un legajo no apunta directo a un area "de calendario": apunta a un Sector
// (division, seguido). Subimos por padreId hasta el primer ancestro
// DIRECCION/DEPARTAMENTO, que es el nivel que Calendario Garden usa como area.
function resolveAreaBySector(
  sectorId: string | null,
  sectoresById: Map<string, SectorRow>
): string | null {
  let current = sectorId ? (sectoresById.get(sectorId) ?? null) : null;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current.id)) {
      return null;
    }
    visited.add(current.id);

    if (current.tipo === "DIRECCION" || current.tipo === "DEPARTAMENTO") {
      return current.nombre;
    }

    current = current.padreId ? (sectoresById.get(current.padreId) ?? null) : null;
  }

  return null;
}

function mapPersonalCategory(
  origenInstitucional: string | null,
  tipoPersonal: string | null
): PersonalCategory {
  if (origenInstitucional === "GOBIERNO") {
    return "Gobierno";
  }

  if (tipoPersonal === "SEGURIDAD" || tipoPersonal === "TECNICO") {
    return "Policial";
  }

  return "Civil";
}

function mapPolicialRole(rangoCuerpo: string | null): PolicialRole | null {
  if (rangoCuerpo === "SUBOFICIAL") return "Suboficial";
  if (rangoCuerpo === "OFICIAL") return "Oficial";
  if (rangoCuerpo === "TECNICO") return "Tecnico";
  return null;
}

type MapResult =
  | { ok: true; payload: BirthdayInsertPayload; sourceAgenteId: string }
  | { ok: false; skipped: SkippedAgente };

function mapAgente(row: AgenteRow, sectoresById: Map<string, SectorRow>): MapResult {
  const label =
    `${row.apellidos?.trim() || "(sin apellido)"}, ${row.nombres?.trim() || "(sin nombre)"}`;

  const skip = (motivo: string): MapResult => ({
    ok: false,
    skipped: { agenteId: row.id, nombre: label, motivo },
  });

  const firstName = sanitizePersonName(row.nombres);
  const lastName = sanitizePersonName(row.apellidos);
  if (!firstName || !lastName) {
    return skip("Nombre o apellido invalido en el legajo.");
  }

  const birthDate = asIsoDateString(row.birth_date);
  if (!birthDate) {
    return skip("Fecha de nacimiento invalida.");
  }
  if (isFutureDate(birthDate)) {
    return skip("Fecha de nacimiento futura.");
  }

  const personalCategory = mapPersonalCategory(row.origenInstitucional, row.tipoPersonal);

  if (personalCategory === "Gobierno") {
    return {
      ok: true,
      sourceAgenteId: row.id,
      payload: {
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        area: null,
        turno: null,
        personal_category: "Gobierno",
        policial_role: null,
        oficial_category: null,
        suboficial_category: null,
      },
    };
  }

  const area = resolveAreaBySector(row.sectorId, sectoresById);
  if (!area) {
    return skip("Sin area/sector resoluble para este legajo.");
  }

  const turnoNormalized = row.turno?.trim() ?? "";
  if (!ALLOWED_TURNOS.has(turnoNormalized.toLowerCase())) {
    return skip(
      `Turno "${row.turno?.trim() || "sin turno"}" no reconocido por Calendario Garden.`
    );
  }

  if (personalCategory === "Policial") {
    const policialRole = mapPolicialRole(row.rango_cuerpo);
    if (!policialRole) {
      return skip("Personal policial sin rango cargado en el legajo.");
    }

    return {
      ok: true,
      sourceAgenteId: row.id,
      payload: {
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        area,
        turno: turnoNormalized,
        personal_category: "Policial",
        policial_role: policialRole,
        oficial_category: policialRole === "Oficial" ? row.rango_nombre : null,
        suboficial_category:
          policialRole === "Suboficial" || policialRole === "Tecnico"
            ? row.rango_nombre
            : null,
      },
    };
  }

  return {
    ok: true,
    sourceAgenteId: row.id,
    payload: {
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      area,
      turno: turnoNormalized,
      personal_category: "Civil",
      policial_role: null,
      oficial_category: null,
      suboficial_category: null,
    },
  };
}

const UPSERT_BATCH_SIZE = 200;

function upsertPath() {
  const params = new URLSearchParams();
  params.set("on_conflict", "source_agente_id");
  params.set("select", "id");
  return `birthdays?${params.toString()}`;
}

async function upsertBatches(
  rows: { payload: BirthdayInsertPayload; sourceAgenteId: string }[]
) {
  let upserted = 0;
  const syncedAt = new Date().toISOString();

  for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + UPSERT_BATCH_SIZE).map(({ payload, sourceAgenteId }) => ({
      ...payload,
      source: "PERFILES_GARDEN" as const,
      source_agente_id: sourceAgenteId,
      synced_at: syncedAt,
    }));

    const response = await supabaseRestFetch(upsertPath(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const message = await readSupabaseErrorMessage(
        response,
        "No se pudo sincronizar un lote de cumpleanos desde Perfiles Garden."
      );
      throw new Error(message);
    }

    const inserted = (await response.json()) as unknown;
    upserted += Array.isArray(inserted) ? inserted.length : batch.length;
  }

  return upserted;
}

// Borra solo filas que ESTE sync sincronizo antes y que ya no corresponden
// (el agente paso a BAJA/PENDIENTE/PASE, perdio la fecha de nacimiento, o se
// volvio no mapeable). Nunca toca filas con source = 'MANUAL'.
async function deleteStaleSyncedRows(activeAgenteIds: string[]) {
  const params = new URLSearchParams();
  params.set("source", "eq.PERFILES_GARDEN");

  if (activeAgenteIds.length > 0) {
    params.set("source_agente_id", `not.in.(${activeAgenteIds.join(",")})`);
  }

  const response = await supabaseRestFetch(`birthdays?${params.toString()}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudieron limpiar los cumpleanos sincronizados obsoletos."
    );
    throw new Error(message);
  }

  const deletedRows = (await response.json()) as unknown;
  return Array.isArray(deletedRows) ? deletedRows.length : 0;
}

export async function syncBirthdaysFromPerfilesGarden(): Promise<SyncSummary> {
  const [agentes, sectores] = await Promise.all([fetchAgentes(), fetchSectores()]);
  const sectoresById = new Map(sectores.map((sector) => [sector.id, sector]));

  const toUpsert: { payload: BirthdayInsertPayload; sourceAgenteId: string }[] = [];
  const skipped: SkippedAgente[] = [];

  for (const row of agentes) {
    const result = mapAgente(row, sectoresById);
    if (result.ok) {
      toUpsert.push({ payload: result.payload, sourceAgenteId: result.sourceAgenteId });
    } else {
      skipped.push(result.skipped);
    }
  }

  const upserted = await upsertBatches(toUpsert);
  const deleted = await deleteStaleSyncedRows(toUpsert.map((row) => row.sourceAgenteId));

  return { upserted, deleted, skipped };
}
