import { NextResponse } from "next/server";
import { adminCreateUserPayloadSchema } from "@/lib/auth/schemas";
import {
  buildAuthErrorResponse,
  createUserByAdmin,
  listUsersForAdmin,
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

    const users = await listUsersForAdmin();
    return NextResponse.json(
      {
        ok: true,
        users,
      },
      {
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo consultar usuarios.");
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoleSession(request, "ADMIN");
    if (!auth.ok) {
      return auth.response;
    }

    const body = (await request.json()) as unknown;
    const parsed = adminCreateUserPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ??
            "Datos invalidos para crear el usuario.",
          code: "INVALID_PAYLOAD",
        },
        { status: 400 }
      );
    }

    const created = await createUserByAdmin(
      parsed.data.email,
      parsed.data.password,
      {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        personalType: parsed.data.personalType,
        hierarchy: parsed.data.hierarchy,
        area: parsed.data.area,
      },
      auth.session.user.id,
      request
    );

    return NextResponse.json(
      {
        ok: true,
        user: created,
      },
      {
        status: 201,
        headers: NO_STORE_HEADERS,
      }
    );
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo crear el usuario.");
  }
}
