import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, configured, isAdminRequest, sameSecret } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Secure only over the https tunnel (x-forwarded-proto), not on the plain
// http://127.0.0.1 loopback — otherwise the browser drops the login cookie
// and local sessions never persist.
function setSession(response: NextResponse, secure: boolean) {
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: adminToken(),
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
}

function requestIsSecure(req: Request): boolean {
  return req.headers.get("x-forwarded-proto") === "https";
}

export async function GET(req: Request) {
  return NextResponse.json({ configured: configured(), authenticated: isAdminRequest(req) });
}

export async function POST(req: Request) {
  if (!configured()) {
    return NextResponse.json({ ok: false, error: "MC_ADMIN_TOKEN is not configured" }, { status: 503 });
  }
  const body = await req.json().catch(() => null) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!sameSecret(token, adminToken())) {
    return NextResponse.json({ ok: false, error: "Invalid admin token" }, { status: 401 });
  }
  return setSession(NextResponse.json({ ok: true }), requestIsSecure(req));
}

export async function DELETE(req: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: ADMIN_COOKIE, value: "", httpOnly: true, sameSite: "strict", secure: requestIsSecure(req), path: "/", maxAge: 0 });
  return response;
}
