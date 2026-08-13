import { NextResponse } from "next/server";
import { decideTask } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/orchestrator/[id]/decide — run the target's acceptance decision (Hop 1). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await decideTask(id);
  const status =
    result.decision === "accept" ? 200 : result.decision === "decline" ? 200 : 502;
  return NextResponse.json({ result }, { status });
}
