import { NextResponse } from "next/server";
import {
  clearClientModeReturnCookie,
  issueClientGuestSessionToken,
  readClientModeReturnSessionFromRequest,
  readSessionFromRequest,
  readSessionTokenFromRequest,
  setClientModeReturnCookie,
  setSessionCookie,
} from "@/lib/auth/server-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const currentSession = await readSessionFromRequest(request);
  const currentSessionToken = readSessionTokenFromRequest(request);
  const returnSession = await readClientModeReturnSessionFromRequest(request);
  const token = await issueClientGuestSessionToken();
  const clienteStartPath = "/anual";

  const destinationUrl = new URL(clienteStartPath, requestUrl.origin);
  const response = NextResponse.redirect(destinationUrl);

  if (currentSession?.user.role === "ADMIN" && currentSessionToken) {
    setClientModeReturnCookie(response, currentSessionToken);
  } else if (returnSession?.user.role !== "ADMIN") {
    clearClientModeReturnCookie(response);
  }

  setSessionCookie(response, token);
  return response;
}
