import { NextResponse } from "next/server";
import { ADMIN_COOKIE, adminToken, configured, isAdminRequest, sameSecret } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function setSession(response: NextResponse) {
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: adminToken(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return response;
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
  return setSession(NextResponse.json({ ok: true }));
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: ADMIN_COOKIE, value: "", httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}
