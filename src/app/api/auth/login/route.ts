import { NextResponse } from "next/server";
import { buildPermissionsForRole } from "@/lib/auth/permissions";
import { loginPayloadSchema } from "@/lib/auth/schemas";
import {
  buildAuthErrorResponse,
  loginWithEmail,
  setSessionCookie,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = loginPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Credenciales invalidas.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await loginWithEmail(
      parsed.data.email,
      parsed.data.password,
      request
    );

    const response = NextResponse.json(
      {
        ok: true,
        user: result.user,
        permissions: buildPermissionsForRole(result.user.role),
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
    setSessionCookie(response, result.sessionToken);
    return response;
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo iniciar sesion.");
  }
}

