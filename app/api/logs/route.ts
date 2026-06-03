import { NextRequest, NextResponse } from "next/server";
import { readEvents, clearEvents, logSources, type LogLevel } from "@/lib/logbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The universal event log behind the Logs tab — newest first, with filters. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const events = readEvents({
    limit: Math.min(Number(sp.get("limit")) || 400, 1000),
    source: sp.get("source") || undefined,
    level: (sp.get("level") as LogLevel) || undefined,
    since: sp.get("since") || undefined,
    q: sp.get("q") || undefined,
  });
  return NextResponse.json({
    events,
    sources: logSources(),
    generatedAt: new Date().toISOString(),
  });
}

/** Clear the log. */
export async function DELETE() {
  clearEvents();
  return NextResponse.json({ ok: true });
}
