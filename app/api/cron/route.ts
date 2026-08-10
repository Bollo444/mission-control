import { NextResponse } from "next/server";
import { readJobs, addJob, updateJob, deleteJob, runJob } from "@/lib/cron";
import { parseSafeCommand } from "@/lib/safe-command";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: readJobs() });
}

export async function POST(req: Request) {
  let body: { name?: string; command?: string; everyMinutes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const command = body.command?.trim();
  if (!command) {
    return NextResponse.json({ ok: false, error: "command is required" }, { status: 400 });
  }
  if (!command.startsWith("flow:") && !command.startsWith("self-update:") && !parseSafeCommand(command)) {
    return NextResponse.json({ ok: false, error: "only approved read-only diagnostics, flow:<id>, or self-update jobs are allowed" }, { status: 400 });
  }
  const job = addJob({
    name: body.name ?? "",
    command,
    everyMinutes: body.everyMinutes ?? 60,
  });
  return NextResponse.json({ ok: true, job });
}

export async function PATCH(req: Request) {
  let body: { id?: string; action?: string; patch?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  if (body.action === "run") {
    const job = await runJob(body.id);
    return NextResponse.json({ ok: !!job, job });
  }
  const job = updateJob(body.id, (body.patch ?? {}) as never);
  return NextResponse.json({ ok: !!job, job });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  return NextResponse.json({ ok: deleteJob(id) });
}
