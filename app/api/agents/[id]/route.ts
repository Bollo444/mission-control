import { NextResponse } from "next/server";
import { getAgent } from "@/lib/registry";
import { getAgentStatus } from "@/lib/detect";
import { listSessions } from "@/lib/sessions";
import { readAgentMemory, getAgentBehavior } from "@/lib/memory";
import { readSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const def = getAgent(id);
  if (!def) return NextResponse.json({ error: "Unknown agent" }, { status: 404 });

  const [status] = await Promise.all([getAgentStatus(def)]);
  const sessions = listSessions(def, 25);
  const memory = readAgentMemory(id);
  const behavior = getAgentBehavior(id);
  const settings = readSettings();

  return NextResponse.json({
    id: def.id,
    name: def.name,
    tagline: def.tagline,
    kind: def.kind,
    accent: def.accent,
    glyph: def.glyph,
    primary: def.primary,
    tools: def.tools,
    homepage: def.homepage,
    marketplace: def.marketplace,
    docsNote: def.docsNote,
    install: def.install ?? null,
    route: settings.routing[id] ?? null,
    status,
    sessions,
    memory,
    role: behavior.role ?? null,
    lens: behavior.lens ?? null,
    directive: behavior.directive ?? null,
  });
}
