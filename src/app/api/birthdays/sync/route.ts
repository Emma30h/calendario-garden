import { NextResponse } from "next/server";
import { requireRoleSession } from "@/lib/auth/server-auth";
import { syncBirthdaysFromPerfilesGarden } from "@/lib/perfiles-garden-sync";
import { PerfilesGardenConfigError } from "@/lib/perfiles-garden-db";
import { SupabaseConfigError } from "@/lib/supabase-rest";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

function readEnvVar(name: string) {
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

// Mismo patron que src/app/api/notifications/run-daily/route.ts: autorizado
// por el CRON_SECRET (Vercel cron) o por una sesion ADMIN (boton manual
// "Sincronizar ahora" en /anual/personal-cargado).
async function requireSyncAuthorization(request: Request) {
  const configuredSecret = readEnvVar("CRON_SECRET");
  const authHeader = request.headers.get("authorization");
  const providedSecret =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";

  if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
    return { ok: true as const };
  }

  const auth = await requireRoleSession(request, "ADMIN");
  if (!auth.ok) {
    return { ok: false as const, response: auth.response };
  }

  return { ok: true as const };
}

function formatRouteError(caught: unknown, fallback: string) {
  if (caught instanceof PerfilesGardenConfigError || caught instanceof SupabaseConfigError) {
    return caught.message;
  }

  if (caught instanceof Error) {
    return caught.message;
  }

  return fallback;
}

export async function POST(request: Request) {
  try {
    const auth = await requireSyncAuthorization(request);
    if (!auth.ok) {
      return auth.response;
    }

    const summary = await syncBirthdaysFromPerfilesGarden();

    return NextResponse.json(
      { data: summary },
      { headers: NO_STORE_HEADERS }
    );
  } catch (caught) {
    return NextResponse.json(
      {
        error: formatRouteError(
          caught,
          "Error inesperado al sincronizar cumpleanos desde Perfiles Garden."
        ),
      },
      { status: 500 }
    );
  }
}

// El cron de Vercel llama por GET (ver README, seccion "Vercel cron setup").
export async function GET(request: Request) {
  return POST(request);
}
