import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  resetPasswordWithOtp,
} from "@/lib/auth/server-auth";
import { resetPasswordPayloadSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = resetPasswordPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Debes enviar e-mail, código y nueva contraseña válidos.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await resetPasswordWithOtp(
      parsed.data.email,
      parsed.data.code,
      parsed.data.password,
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
