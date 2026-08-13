import { NextResponse } from "next/server";
import { getTask } from "@/lib/taskStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orchestrator/[id] — fetch a single delegation task. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const task = await getTask(id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}
