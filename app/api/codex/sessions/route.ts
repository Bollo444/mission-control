import { NextResponse } from "next/server";
import { getCodexSessions } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ sessions: getCodexSessions() });
}
