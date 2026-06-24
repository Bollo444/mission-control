import { NextResponse } from "next/server";
import { isAllowedSessionPath, readConversation } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/content?path=<abs> — the parsed conversation for one
 * session file. The path is allow-listed to the agents' session directories
 * (anything outside → 403), so this never reads arbitrary files.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("path");
  if (!p) return NextResponse.json({ error: "path required" }, { status: 400 });
  if (!isAllowedSessionPath(p)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ messages: readConversation(p) });
}
