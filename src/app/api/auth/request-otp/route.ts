import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  requestEmailOtp,
} from "@/lib/auth/server-auth";
import { requestOtpPayloadSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = requestOtpPayloadSchema.safeParse(body);
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

    const result = await requestEmailOtp(parsed.data.email, request);
    return NextResponse.json(
      {
        ok: true,
        email: result.email,
        alreadyVerified: result.alreadyVerified,
        otp: result.otp,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo reenviar el codigo OTP.");
  }
}

