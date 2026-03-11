import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  getSessionViewFromRequest,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET(request: Request) {
  try {
    const view = await getSessionViewFromRequest(request);
    return NextResponse.json(view, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return buildAuthErrorResponse(error, "No se pudo leer la sesion.");
  }
}

