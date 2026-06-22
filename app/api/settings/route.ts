import { NextResponse } from "next/server";
import { readSettings, writeSettings, publicSettings, getGatewayToken } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  getGatewayToken(); // ensure the gateway token exists so the UI can display it
  return NextResponse.json(publicSettings(readSettings()));
}

export async function POST(req: Request) {
  let body: {
    routing?: Record<string, { provider: string; model: string }>;
    routingPreferred?: Record<string, { provider: string; model: string }>;
    apiKeys?: Record<string, string>;
    vaultDir?: string;
    anthropicSlots?: { haiku: { provider: string; model: string }; sonnet: { provider: string; model: string }; opus: { provider: string; model: string } };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }
  // A routing change from the UI is an explicit user choice: it becomes the new
  // preferred default AND the live route (clearing any prior health failover),
  // unless the caller is specifically setting only one of the two.
  if (body.routing && !body.routingPreferred) body.routingPreferred = body.routing;
  const next = writeSettings(body);
  return NextResponse.json({ ok: true, settings: publicSettings(next) });
}
