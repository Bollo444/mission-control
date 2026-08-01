import { NextResponse } from "next/server";
import { callTool } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { server, tool, args } — call an MCP server tool directly. */
export async function POST(req: Request) {
  let body: { server?: string; tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!body.server || !body.tool) {
    return NextResponse.json({ ok: false, error: "server and tool are required" }, { status: 400 });
  }
  try {
    const result = await callTool(body.server, body.tool, body.args ?? {});
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
