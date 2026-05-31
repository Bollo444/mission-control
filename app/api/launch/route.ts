import { NextResponse } from "next/server";
import { launchAgent, installAgent } from "@/lib/launch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { id?: string; cwd?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid request body" }, { status: 400 });
  }
  const { id, cwd, action = "launch" } = body;
  if (!id) return NextResponse.json({ ok: false, message: "Missing agent id" }, { status: 400 });

  const result = action === "install" ? installAgent(id) : launchAgent(id, cwd);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
