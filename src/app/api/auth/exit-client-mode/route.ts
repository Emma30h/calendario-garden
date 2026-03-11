import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  clearClientModeReturnCookie,
  readClientModeReturnSessionFromRequest,
  readClientModeReturnTokenFromRequest,
  readSessionFromRequest,
  setSessionCookie,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const currentSession = await readSessionFromRequest(request);
    if (!currentSession) {
      return NextResponse.json(
        { error: "No autenticado.", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    if (currentSession.user.role !== "CLIENTE") {
      return NextResponse.json(
        { error: "No estas en modo cliente.", code: "CLIENT_MODE_NOT_ACTIVE" },
        { status: 400 }
      );
    }

    const returnToken = readClientModeReturnTokenFromRequest(request);
    const returnSession = await readClientModeReturnSessionFromRequest(request);
    if (!returnToken || !returnSession || returnSession.user.role !== "ADMIN") {
      const response = NextResponse.json(
        {
          error: "No hay sesion admin disponible para salir del modo cliente.",
          code: "CLIENT_MODE_NOT_ACTIVE",
        },
        { status: 400 }
      );
      clearClientModeReturnCookie(response);
      return response;
    }

    const response = NextResponse.json({
      ok: true,
    });
    setSessionCookie(response, returnToken);
    clearClientModeReturnCookie(response);
    return response;
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo salir del modo cliente.");
  }
}
