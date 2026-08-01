import { NextResponse } from "next/server";
import { getAgent } from "@/lib/registry";
import { getGatewayToken } from "@/lib/settings";
import {
  readAgentMemory,
  writeVaultFile,
  setAgentDirective,
  getAgentBehavior,
  agentNotePath,
} from "@/lib/memory";
import { logEvent } from "@/lib/logbook";
import { checkWritePermission } from "@/lib/write-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Self-edit hook. A running agent (one pointed at the Fleet Gateway) can read and
  rewrite ITS OWN note / directive mid-task. Authenticated with the gateway token;
  scoped by the X-MC-Agent header. The note path is derived from that id, so an
  agent can never address another agent's file — the guardrail is structural.

  Examples (an agent updating how it should behave):
    curl -H "Authorization: Bearer $MC_GATEWAY_TOKEN" -H "X-MC-Agent: cline" \
         http://127.0.0.1:4317/api/agent-note
    curl -X POST -H "Authorization: Bearer $MC_GATEWAY_TOKEN" -H "X-MC-Agent: cline" \
         -H "content-type: application/json" \
         -d '{"directive":"Prefer the cheapest viable route; escalate only on failure."}' \
         http://127.0.0.1:4317/api/agent-note
*/

function authed(req: Request): boolean {
  const token = getGatewayToken();
  if (!token) return false;
  const hdr = req.headers.get("authorization") || "";
  const bearer = hdr.toLowerCase().startsWith("bearer ") ? hdr.slice(7).trim() : "";
  const alt = (req.headers.get("x-mc-gateway-token") || "").trim();
  return bearer === token || alt === token;
}

function callerId(req: Request): string | null {
  const id = (req.headers.get("x-mc-agent") || "").trim();
  return id && getAgent(id) ? id : null;
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = callerId(req);
  if (!id) return NextResponse.json({ error: "Set X-MC-Agent to a known agent id" }, { status: 400 });
  return NextResponse.json({
    id,
    path: agentNotePath(id),
    content: readAgentMemory(id),
    behavior: getAgentBehavior(id),
  });
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = callerId(req);
  if (!id) return NextResponse.json({ error: "Set X-MC-Agent to a known agent id" }, { status: 400 });

  // Sentinel-gated writes. Agents other than Sentinel may only write to their
  // OWN vault note (structurally scoped to one file by this hook). Sentinel
  // is the sole writer for the protected executable surface (lib/, app/,
  // components/, registry, settings). This keeps the self-improvement loop
  // alive while bounding the blast radius of a misbehaving agent.
  const target = agentNotePath(id);
  const check = checkWritePermission({
    callerAgentId: id,
    target,
    kind: "file.write",
    ownAgentNote: true,
  });
  if (!check.ok) {
    logEvent({
      source: "write-gate",
      level: "warn",
      event: "denied agent-note write",
      detail: `${id} → ${target} (required=${check.requiredAgent})`,
    });
    return NextResponse.json(
      { ok: false, error: `write denied: ${check.reason}`, requiredAgent: check.requiredAgent },
      { status: 403 }
    );
  }

  let body: { content?: string; directive?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let ok = false;
  let mode = "";
  if (typeof body.directive === "string") {
    ok = setAgentDirective(id, body.directive);
    mode = "directive";
  } else if (typeof body.content === "string") {
    ok = writeVaultFile(agentNotePath(id), body.content);
    mode = "note";
  } else {
    return NextResponse.json({ ok: false, error: "Provide `content` (full note) or `directive`." }, { status: 400 });
  }

  if (ok) {
    logEvent({
      source: "agent",
      level: "info",
      event: `self-edited ${mode}`,
      detail: getAgent(id)?.name ?? id,
      meta: { agentId: id },
    });
  }
  return NextResponse.json(
    { ok, path: agentNotePath(id), behavior: getAgentBehavior(id) },
    { status: ok ? 200 : 400 }
  );
}
