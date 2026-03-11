import { NextResponse } from "next/server";
import { buildPermissionsForRole } from "@/lib/auth/permissions";
import {
  buildAuthErrorResponse,
  setSessionCookie,
  verifyEmailOtp,
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
            "Debes enviar e-mail y codigo valido.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await verifyEmailOtp(
      parsed.data.email,
      parsed.data.code,
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
    return buildAuthErrorResponse(error, "No se pudo validar el codigo OTP.");
  }
}

