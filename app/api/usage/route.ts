import { NextResponse } from "next/server";
import { usageReport, clearUsage } from "@/lib/usage";
import { PROVIDERS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Per-provider gateway usage + budgets (for the Settings gauges & analytics). */
export async function GET() {
  const free = PROVIDERS.filter((p) => p.free).map((p) => p.id);
  return NextResponse.json({ usage: usageReport(free), generatedAt: new Date().toISOString() });
}

export async function DELETE() {
  clearUsage();
  return NextResponse.json({ ok: true });
}
