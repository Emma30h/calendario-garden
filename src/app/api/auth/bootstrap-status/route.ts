import { NextResponse } from "next/server";
import {
  buildAuthErrorResponse,
  readBootstrapStatus,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export async function GET() {
  try {
    const status = await readBootstrapStatus();
    return NextResponse.json(status, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return buildAuthErrorResponse(
      error,
      "No se pudo consultar estado de bootstrap."
    );
  }
}

