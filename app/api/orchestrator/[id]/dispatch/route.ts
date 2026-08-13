import { NextResponse } from "next/server";
import { dispatchRun } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/orchestrator/[id]/dispatch — launch the real headless run (Hop 2). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await dispatchRun(id);
  return NextResponse.json({ result }, { status: result.ok ? 200 : 502 });
}
