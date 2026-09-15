import { Pool, type QueryResultRow } from "pg";

// Conexion de SOLO LECTURA al Postgres de Perfiles Garden (mismo proyecto de
// Supabase que este app, schema "gestion_personal"). Este archivo nunca debe
// emitir INSERT/UPDATE/DELETE: Perfiles Garden es la fuente de verdad del
// legajo del personal y este proyecto solo lee de ahi para completar
// public.birthdays (ver src/lib/perfiles-garden-sync.ts).

export class PerfilesGardenConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerfilesGardenConfigError";
  }
}

function readEnvVar(name: string) {
  const raw = process.env[name];
  if (typeof raw !== "string") {
    return "";
  }

  return raw.trim();
}

let pool: Pool | null = null;

function getPool() {
  if (pool) {
    return pool;
  }

  const connectionString = readEnvVar("PERFILES_GARDEN_DATABASE_URL");
  if (!connectionString) {
    throw new PerfilesGardenConfigError(
      "Falta PERFILES_GARDEN_DATABASE_URL."
    );
  }

  pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
  });

  return pool;
}

export async function queryPerfilesGarden<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  const client = await getPool().connect();
  try {
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}
