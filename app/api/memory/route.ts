import { NextResponse } from "next/server";
import {
  ensureVault,
  readActivity,
  readSharedKnowledge,
  writeSharedKnowledge,
  writeAgentMemory,
  appendActivity,
  VAULT_DIR,
} from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const v = ensureVault();
  return NextResponse.json({
    vaultDir: VAULT_DIR,
    created: v.created,
    activity: readActivity(120),
    shared: readSharedKnowledge(),
  });
}

export async function POST(req: Request) {
  let body: {
    op?: string;
    agentId?: string;
    content?: string;
    action?: string;
    detail?: string;
    agentName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }

  switch (body.op) {
    case "agent-memory":
      if (!body.agentId || body.content == null)
        return NextResponse.json({ ok: false, message: "Missing fields" }, { status: 400 });
      writeAgentMemory(body.agentId, body.content);
      return NextResponse.json({ ok: true });
    case "shared":
      if (body.content == null)
        return NextResponse.json({ ok: false, message: "Missing content" }, { status: 400 });
      writeSharedKnowledge(body.content);
      return NextResponse.json({ ok: true });
    case "activity":
      if (!body.agentId || !body.action)
        return NextResponse.json({ ok: false, message: "Missing fields" }, { status: 400 });
      appendActivity({
        agentId: body.agentId,
        agentName: body.agentName || body.agentId,
        action: body.action,
        detail: body.detail,
      });
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ ok: false, message: "Unknown op" }, { status: 400 });
  }
}
