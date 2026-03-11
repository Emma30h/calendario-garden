import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  validatePasswordResetOtp,
} from "@/lib/auth/server-auth";
import { verifyOtpPayloadSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = verifyOtpPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Debes enviar e-mail y código válido.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await validatePasswordResetOtp(
      parsed.data.email,
      parsed.data.code
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
    return buildAuthErrorResponse(error, "No se pudo validar el código OTP.");
  }
}
