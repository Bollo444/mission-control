import { NextResponse } from "next/server";
import { trackEvent, buildProfile, generateInsights } from "@/lib/learning";
import type { EventKind } from "@/lib/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const profile = buildProfile();
  const insights = generateInsights(profile);
  return NextResponse.json({ profile, insights });
}

export async function POST(req: Request) {
  let body: { kind?: string; detail?: string; meta?: Record<string, string | number | boolean> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  if (!body.kind) {
    return NextResponse.json({ ok: false, error: "kind is required" }, { status: 400 });
  }

  trackEvent({
    ts: new Date().toISOString(),
    kind: body.kind as EventKind,
    detail: body.detail,
    meta: body.meta,
  });

  return NextResponse.json({ ok: true });
}
