import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  requireRoleSession,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const requestUrl = new URL(request.url);
    const accessUrl = `${requestUrl.origin}/acceso-cliente`;
    return NextResponse.json(
      {
        ok: true,
        accessUrl,
        permanent: true,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(
      error,
      "No se pudo leer el link de acceso cliente."
    );
  }
}
