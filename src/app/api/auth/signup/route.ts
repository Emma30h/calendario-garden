import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  createPublicSignupUser,
} from "@/lib/auth/server-auth";
import { signupPayloadSchema } from "@/lib/auth/schemas";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const parsed = signupPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Datos invalidos para crear la cuenta.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const result = await createPublicSignupUser(
      parsed.data.email,
      parsed.data.password,
      {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        personalType: parsed.data.personalType,
        hierarchy: parsed.data.hierarchy,
        area: parsed.data.area,
      },
      request
    );

    return NextResponse.json(
      {
        ok: true,
        requiresVerification: true,
        email: result.email,
        role: result.role,
        bootstrap: result.bootstrap,
        otp: result.otp,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo crear la cuenta.");
  }
}
