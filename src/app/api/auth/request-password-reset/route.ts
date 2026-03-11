import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  requestPasswordResetOtp,
} from "@/lib/auth/server-auth";
import { requestPasswordResetPayloadSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = requestPasswordResetPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Debes enviar un e-mail valido.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await requestPasswordResetOtp(parsed.data.email, request);
    return NextResponse.json(
      {
        ok: true,
        email: result.email,
        otp: result.otp,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(
      error,
      "No se pudo enviar el codigo de recuperacion."
    );
  }
}
