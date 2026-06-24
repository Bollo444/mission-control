import { NextResponse } from "next/server";
import { deployGatewayRun } from "@/lib/subagents";
import { HATS, getHat, hatSystemPrompt } from "@/lib/sentinel-hats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  — the hat catalog (for the UI to render chips).
 * POST { objective, hats: string[] } — deploy one Sentinel sub-agent per
 *   selected hat, in parallel, each framed by its role. Returns the runs;
 *   poll /api/subagents for live status/output (runs are tagged via label).
 */
export async function GET() {
  return NextResponse.json({ hats: HATS });
}

export async function POST(req: Request) {
  let body: { objective?: string; hats?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  const objective = (body.objective ?? "").trim();
  if (!objective) {
    return NextResponse.json({ ok: false, error: "objective is required" }, { status: 400 });
  }
  const hatIds = (body.hats ?? []).filter((id) => getHat(id));
  if (hatIds.length === 0) {
    return NextResponse.json({ ok: false, error: "select at least one hat" }, { status: 400 });
  }

  // Hats run through the headless gateway (free fleet) — sentinel.py itself is
  // interactive and can't run autonomously. Each is a security-framed prompt.
  const deployed = hatIds.map((id) => {
    const hat = getHat(id)!;
    const run = deployGatewayRun({
      label: `${hat.name} hat`,
      system: hatSystemPrompt(hat),
      user: `Objective: ${objective.trim()}`,
      agentId: "sentinel",
      agentName: "Sentinel",
    });
    return run.id;
  });

  return NextResponse.json({ ok: true, deployed, errors: [] });
}
