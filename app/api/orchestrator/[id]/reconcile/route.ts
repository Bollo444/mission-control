import { NextResponse } from "next/server";
import { reconcileRun } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/orchestrator/[id]/reconcile — sync a running task against
 *  subagents.json and complete report-back when the run has finished. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await reconcileRun(id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}
