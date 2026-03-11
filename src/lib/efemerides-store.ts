import "server-only";

import {
  readSupabaseErrorMessage,
  supabaseRestFetch,
} from "@/lib/supabase-rest";
import {
  type EfemerideEvent,
  type EfemerideType,
  type EfemeridesImportPayload,
  type EfemeridesStoredPayload,
} from "@/lib/efemerides";

type MonthPointer = {
  year: number;
  month: number;
};

type SaveMode = "insert" | "replace";

type EfemeridesDbPayload = {
  source_name: string;
  month: number;
  year: number;
  imported_at: string;
  events: EfemerideEvent[];
  event_count: number;
};

const EFEMERIDES_SELECT =
  "source_name,month,year,imported_at,events,event_count";
const EFEMERIDE_TYPES = new Set<EfemerideType>([
  "cumpleanos",
  "aniversario",
  "dia",
  "sin_novedad",
  "otro",
]);

export class EfemeridesConflictError extends Error {
  existing: EfemeridesStoredPayload;

  constructor(existing: EfemeridesStoredPayload) {
    super("Ya existe un PDF cargado para ese mes.");
    this.name = "EfemeridesConflictError";
    this.existing = existing;
  }
}

function isValidMonthPointer(pointer: MonthPointer) {
  return (
    Number.isInteger(pointer.year) &&
    Number.isInteger(pointer.month) &&
    pointer.month >= 1 &&
    pointer.month <= 12
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function asIsoTimestamp(value: unknown) {
  const parsed = asNonEmptyString(value);
  if (!parsed) {
    return null;
  }

  return Number.isNaN(new Date(parsed).getTime()) ? null : parsed;
}

function isEfemerideType(value: unknown): value is EfemerideType {
  return typeof value === "string" && EFEMERIDE_TYPES.has(value as EfemerideType);
}

function normalizeEvent(value: unknown): EfemerideEvent | null {
  const parsed = asRecord(value);
  if (!parsed) {
    return null;
  }

  const id = asNonEmptyString(parsed.id);
  const title = asNonEmptyString(parsed.title);
  const year = asInteger(parsed.year);
  const month = asInteger(parsed.month);
  const day = asInteger(parsed.day);
  const type = parsed.type;

  if (!id || !title || year === null || month === null || day === null) {
    return null;
  }

  if (!isEfemerideType(type)) {
    return null;
  }

  return {
    id,
    title,
    type,
    year,
    month,
    day,
  };
}

function normalizeStoredPayload(value: unknown): EfemeridesStoredPayload | null {
  const parsed = asRecord(value);
  if (!parsed) {
    return null;
  }

  const sourceName =
    asNonEmptyString(parsed.source_name) ?? asNonEmptyString(parsed.sourceName);
  const month = asInteger(parsed.month);
  const year = asInteger(parsed.year);
  const importedAt =
    asIsoTimestamp(parsed.imported_at) ?? asIsoTimestamp(parsed.importedAt);
  const rawEvents = parsed.events;

  if (
    !sourceName ||
    month === null ||
    year === null ||
    !importedAt ||
    !Array.isArray(rawEvents)
  ) {
    return null;
  }

  const events = rawEvents
    .map((event) => normalizeEvent(event))
    .filter((event): event is EfemerideEvent => event !== null);

  const eventCount = asInteger(parsed.event_count) ?? asInteger(parsed.eventCount);

  return {
    sourceName,
    month,
    year,
    importedAt,
    events,
    eventCount: eventCount ?? events.length,
  };
}

function toDbPayload(payload: EfemeridesStoredPayload): EfemeridesDbPayload {
  return {
    source_name: payload.sourceName,
    month: payload.month,
    year: payload.year,
    imported_at: payload.importedAt,
    events: payload.events,
    event_count: payload.eventCount,
  };
}

function toStoredPayload(payload: EfemeridesImportPayload): EfemeridesStoredPayload {
  return {
    ...payload,
    eventCount: payload.events.length,
  };
}

function monthPath(pointer: MonthPointer) {
  const params = new URLSearchParams();
  params.set("select", EFEMERIDES_SELECT);
  params.set("year", `eq.${pointer.year}`);
  params.set("month", `eq.${pointer.month}`);
  params.set("limit", "1");
  return `efemerides?${params.toString()}`;
}

async function readMonthFromDb(pointer: MonthPointer) {
  const response = await supabaseRestFetch(monthPath(pointer));

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudieron leer efemérides del mes."
    );
    throw new Error(message);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];

  return (
    rows
      .map((row) => normalizeStoredPayload(row))
      .find((row): row is EfemeridesStoredPayload => row !== null) ?? null
  );
}

async function readWriteResponse(
  response: Response,
  fallbackMessage: string
): Promise<EfemeridesStoredPayload> {
  if (!response.ok) {
    const message = await readSupabaseErrorMessage(response, fallbackMessage);
    throw new Error(message);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  const first =
    rows
      .map((row) => normalizeStoredPayload(row))
      .find((row): row is EfemeridesStoredPayload => row !== null) ?? null;

  if (!first) {
    throw new Error("La base de datos no devolvió un registro válido.");
  }

  return first;
}

export async function readEfemeridesForMonth(pointer: MonthPointer) {
  if (!isValidMonthPointer(pointer)) {
    return null;
  }

  return readMonthFromDb(pointer);
}

export async function readLatestEfemerides() {
  const params = new URLSearchParams();
  params.set("select", EFEMERIDES_SELECT);
  params.append("order", "imported_at.desc");
  params.set("limit", "1");

  const response = await supabaseRestFetch(`efemerides?${params.toString()}`);

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudo leer la última importación de efemérides."
    );
    throw new Error(message);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];

  return (
    rows
      .map((row) => normalizeStoredPayload(row))
      .find((row): row is EfemeridesStoredPayload => row !== null) ?? null
  );
}

export async function saveEfemeridesForMonth(
  payload: EfemeridesImportPayload,
  options?: { replace?: boolean }
): Promise<{ stored: EfemeridesStoredPayload; mode: SaveMode }> {
  const replace = options?.replace === true;
  const storedPayload = toStoredPayload(payload);
  const pointer = { year: storedPayload.year, month: storedPayload.month };

  if (!isValidMonthPointer(pointer)) {
    throw new Error("Mes o año inválidos en el archivo procesado.");
  }

  const existing = await readMonthFromDb(pointer);
  if (existing && !replace) {
    throw new EfemeridesConflictError(existing);
  }

  const dbPayload = toDbPayload(storedPayload);
  const params = new URLSearchParams();
  params.set("select", EFEMERIDES_SELECT);

  if (existing) {
    params.set("year", `eq.${pointer.year}`);
    params.set("month", `eq.${pointer.month}`);

    const response = await supabaseRestFetch(`efemerides?${params.toString()}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(dbPayload),
    });

    const stored = await readWriteResponse(
      response,
      "No se pudieron reemplazar las efemérides del mes."
    );
    return { stored, mode: "replace" };
  }

  const response = await supabaseRestFetch(`efemerides?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(dbPayload),
  });

  if (!response.ok && response.status === 409) {
    const conflict = await readMonthFromDb(pointer);
    if (conflict) {
      throw new EfemeridesConflictError(conflict);
    }
  }

  const stored = await readWriteResponse(
    response,
    "No se pudieron guardar las efemérides del mes."
  );
  return { stored, mode: "insert" };
}

export async function deleteEfemeridesForMonth(pointer: MonthPointer) {
  if (!isValidMonthPointer(pointer)) {
    return false;
  }

  const params = new URLSearchParams();
  params.set("year", `eq.${pointer.year}`);
  params.set("month", `eq.${pointer.month}`);
  params.set("select", "id");

  const response = await supabaseRestFetch(`efemerides?${params.toString()}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=representation",
    },
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudieron eliminar las efemérides del mes."
    );
    throw new Error(message);
  }

  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [];
  return rows.length > 0;
}

export async function clearEfemeridesStore() {
  const response = await supabaseRestFetch("efemerides", {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });

  if (!response.ok) {
    const message = await readSupabaseErrorMessage(
      response,
      "No se pudieron eliminar todas las efemérides."
    );
    throw new Error(message);
  }
}
