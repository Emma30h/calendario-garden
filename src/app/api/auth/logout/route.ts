import { NextResponse } from "next/server";
import {
  clearClientModeReturnCookie,
  clearSessionCookie,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

function clearAuthCookies(response: NextResponse) {
  clearSessionCookie(response);
  clearClientModeReturnCookie(response);
}

function resolveNextPath(request: Request) {
  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next")?.trim() ?? "";

  if (next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  return "/auth/login?next=/anual";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const response = NextResponse.redirect(
    new URL(resolveNextPath(request), requestUrl.origin)
  );
  clearAuthCookies(response);
  return response;
}

export async function POST() {
  const response = NextResponse.json({
    ok: true,
  });
  clearAuthCookies(response);
  return response;
}
