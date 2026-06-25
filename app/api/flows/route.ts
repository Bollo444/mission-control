import { NextResponse } from "next/server";
import { listFlows, saveFlow, deleteFlow, type Flow } from "@/lib/flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ flows: listFlows() });
}

export async function POST(req: Request) {
  let flow: Flow;
  try {
    flow = (await req.json()) as Flow;
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!flow?.id || !flow?.name) {
    return NextResponse.json({ ok: false, error: "id and name required" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, flow: saveFlow(flow) });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  deleteFlow(id);
  return NextResponse.json({ ok: true });
}
