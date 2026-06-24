import { NextResponse } from "next/server";
import { deploySubagent } from "@/lib/subagents";
import { HATS, getHat, buildHatTask } from "@/lib/sentinel-hats";

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

  const deployed: string[] = [];
  const errors: string[] = [];
  for (const id of hatIds) {
    const hat = getHat(id)!;
    const res = deploySubagent("sentinel", buildHatTask(hat, objective), `${hat.name} hat`);
    if (res.ok && res.run) deployed.push(res.run.id);
    else errors.push(`${hat.name}: ${res.error}`);
  }

  // If nothing launched (e.g. Sentinel not installed), surface the failure.
  if (deployed.length === 0) {
    return NextResponse.json(
      { ok: false, error: errors[0] ?? "no hats deployed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, deployed, errors });
}
