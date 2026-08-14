import { NextResponse } from "next/server";
import { listTasks, createTask } from "@/lib/taskStore";
import { decideTask } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/orchestrator — list all delegation tasks (newest first). */
export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json({ tasks, generatedAt: new Date().toISOString() });
}

/** POST /api/orchestrator — create a new delegation contract (Hop 0). */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      summary?: string;
      task?: string;
      target?: string;
      proposedBy?: "hermes" | "user";
      context?: string;
      successCriteria?: string;
      scope?: { write?: boolean; vault?: boolean; gateway?: boolean; shell?: boolean };
    };
    const task = await createTask({
      summary: body.summary ?? "",
      task: body.task ?? "",
      target: body.target ?? "",
      proposedBy: body.proposedBy ?? "user",
      context: body.context,
      successCriteria: body.successCriteria,
      scope: body.scope ?? {},
    });
    // Auto-drive the loop: the target's own model reviews the contract and
    // accepts/declines (and dispatches on accept) without a manual click —
    // creating a delegation IS the trigger, like automation's hub connection.
    void decideTask(task.id).catch(() => {});
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
