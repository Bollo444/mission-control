import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/registry";
import { listSessions } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const all = AGENTS.flatMap((def) => listSessions(def, 30));
  all.sort((a, b) => +new Date(b.mtime) - +new Date(a.mtime));
  return NextResponse.json({ sessions: all.slice(0, 200), total: all.length });
}
