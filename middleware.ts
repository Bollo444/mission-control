import { NextRequest, NextResponse } from "next/server";
import { adminToken, bearerToken, cookieToken, sameSecret } from "./lib/admin-auth";

function unauthorized(message: string, status = 401) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function sameOrigin(request: NextRequest): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite.toLowerCase())) return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // CLI clients do not send Origin.
  const forwardedProto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return origin === `${forwardedProto}://${forwardedHost}` || origin === request.nextUrl.origin;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/api/auth") return NextResponse.next();

  const expected = adminToken();
  if (!expected) return unauthorized("MC_ADMIN_TOKEN is not configured", 503);

  const headerOk = sameSecret(bearerToken(request), expected);
  const cookieOk = sameSecret(cookieToken(request), expected);
  if (!headerOk && !cookieOk) return unauthorized("Admin authentication required");

  const mutating = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);
  // Cookie-authenticated browser writes must be same-origin. Header-authenticated
  // CLI callers remain usable from non-browser environments.
  if (mutating && cookieOk && !headerOk && !sameOrigin(request)) {
    return unauthorized("Cross-origin mutation rejected", 403);
  }

  // Normalize browser sessions to the same bearer form used by the gateway,
  // Anthropic bridge, and agent self-edit endpoints.
  if (cookieOk && !headerOk) {
    const headers = new Headers(request.headers);
    headers.set("authorization", `Bearer ${expected}`);
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
