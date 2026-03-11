import { NextResponse } from "next/server";
import {
  clearClientModeReturnCookie,
  clearSessionCookie,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({
    ok: true,
  });
  clearSessionCookie(response);
  clearClientModeReturnCookie(response);
  return response;
}
