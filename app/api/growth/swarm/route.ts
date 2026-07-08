import { NextResponse } from "next/server";
import { deployGatewayRun } from "@/lib/subagents";
import { HATS, getHat, hatSystemPrompt } from "@/lib/growth-hats";
import { collectTarget } from "@/lib/target-fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  — the hat catalog (for the UI to render chips).
 * POST { objective, hats: string[], targets?: string } — deploy one Claude
 *   sub-agent per selected hat, in parallel, each framed by its lens.
 *   `targets` is newline/comma separated (site + social profile URLs); each
 *   reachable one is fetched and shared with every hat. Runs are tagged
 *   agentId:"growth" so they never mix with the Sentinel hat swarm's runs in
 *   /api/subagents — poll that endpoint for live status/output.
 */
export async function GET() {
  return NextResponse.json({ hats: HATS });
}

export async function POST(req: Request) {
  let body: { objective?: string; hats?: string[]; targets?: string };
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

  // Optional targets — the business's site and/or social profile URLs, one per
  // line or comma. Each is fetched once and shared across every hat so they
  // reason over real content, not a description. JS-rendered platforms (most
  // social sites) often yield thin/no text — hats are instructed to say so
  // rather than invent numbers for what they couldn't verify.
  const targets = (body.targets ?? "")
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);

  let contextBlock = "";
  if (targets.length) {
    const collected = await Promise.all(targets.map((t) => collectTarget(t)));
    contextBlock = collected
      .map((ctx, i) =>
        ctx.kind !== "none" && ctx.summary
          ? `\n\n--- Auto-collected recon for ${targets[i]} (${ctx.kind}) ---\n${ctx.summary}\n--- end recon ---`
          : ""
      )
      .filter(Boolean)
      .join("");
  }

  const deployed = hatIds.map((id) => {
    const hat = getHat(id)!;
    const run = deployGatewayRun({
      label: `${hat.name} hat`,
      system: hatSystemPrompt(hat),
      user: `Objective: ${objective}${contextBlock}`,
      agentId: "growth",
      agentName: "Claude",
    });
    return run.id;
  });

  return NextResponse.json({ ok: true, deployed, errors: [], targets });
}
