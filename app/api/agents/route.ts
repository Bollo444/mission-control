import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/registry";
import { getAgentStatus } from "@/lib/detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const statuses = await Promise.all(
    AGENTS.map(async (def) => {
      const status = await getAgentStatus(def);
      return {
        id: def.id,
        name: def.name,
        tagline: def.tagline,
        kind: def.kind,
        accent: def.accent,
        glyph: def.glyph,
        primary: def.primary,
        tools: def.tools,
        homepage: def.homepage,
        installable: Boolean(def.install?.command),
        status,
      };
    })
  );
  return NextResponse.json({ agents: statuses, generatedAt: new Date().toISOString() });
}
