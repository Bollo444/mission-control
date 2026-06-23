import { NextResponse } from "next/server";
import { listRuns, deploySubagent } from "@/lib/subagents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: listRuns() });
}

export async function POST(req: Request) {
  let body: { agentId?: string; task?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!body.agentId || !body.task?.trim()) {
    return NextResponse.json({ ok: false, error: "agentId and task are required" }, { status: 400 });
  }
  const result = deploySubagent(body.agentId, body.task);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
