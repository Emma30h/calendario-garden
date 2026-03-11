import { NextResponse } from "next/server";
import { changePasswordPayloadSchema } from "@/lib/auth/schemas";
import {
  buildAuthErrorResponse,
  changePasswordForAuthenticatedUser,
  requireAuthSession,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const auth = await requireAuthSession(request);
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json()) as unknown;
    const parsed = changePasswordPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Debes completar los datos para cambiar la contraseña.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await changePasswordForAuthenticatedUser(
      auth.session.user.id,
      parsed.data.currentPassword,
      parsed.data.newPassword,
      request
    );

    return NextResponse.json(
      {
        ok: true,
        email: result.email,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo cambiar la contraseña.");
  }
}
