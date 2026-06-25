import { NextResponse } from "next/server";
import { getCodexConfig, alignGateway } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCodexConfig());
}

export async function POST(req: Request) {
  let body: { action?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 }); }
  if (body.action === "align") return NextResponse.json(alignGateway());
  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
