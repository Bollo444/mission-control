import { NextResponse } from "next/server";
import { getFlow, runFlow, type Flow } from "@/lib/flows";
import { logEvent } from "@/lib/logbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { id } (run a saved flow) or { flow } (run an unsaved one). */
export async function POST(req: Request) {
  let body: { id?: string; flow?: Flow };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const flow = body.flow ?? (body.id ? getFlow(body.id) : undefined);
  if (!flow) return NextResponse.json({ ok: false, error: "flow not found" }, { status: 404 });

  logEvent({ source: "system", level: "info", event: `Flow run: ${flow.name}` });
  const result = await runFlow(flow);
  return NextResponse.json({ ok: true, ...result });
}
