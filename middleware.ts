import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/constants";
import { verifySessionToken } from "@/lib/auth/session-token";

function resolveSessionSecret() {
  const raw = process.env.AUTH_SESSION_SECRET?.trim() ?? "";
  return raw.length >= 32 ? raw : null;
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/auth/login";
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(loginUrl);
}

function buildClienteStartPath() {
  const now = new Date();
  return `/mes/${now.getMonth() + 1}/dia/${now.getDate()}`;
}

function redirectToRoleHome(request: NextRequest, role: "ADMIN" | "CLIENTE") {
  const destination = role === "ADMIN" ? "/anual" : buildClienteStartPath();
  const url = request.nextUrl.clone();
  url.pathname = destination;
  url.search = "";
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value ?? "";
  const secret = resolveSessionSecret();
  const session = token && secret ? await verifySessionToken(token, secret) : null;

  if (pathname === "/auth/login") {
    if (!session) {
      return NextResponse.next();
    }

    return redirectToRoleHome(request, session.role);
  }

  if (!session) {
    return redirectToLogin(request);
  }

  if (pathname.startsWith("/anual")) {
    const isAnnualRoot = pathname === "/anual";
    const isPersonalCargado =
      pathname === "/anual/personal-cargado" ||
      pathname.startsWith("/anual/personal-cargado/");
    const isAllowedAnnualForClient = isAnnualRoot || isPersonalCargado;

    if (session.role === "CLIENTE" && !isAllowedAnnualForClient) {
      const url = request.nextUrl.clone();
      url.pathname = buildClienteStartPath();
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/anual/:path*", "/mes/:path*", "/auth/login"],
};
