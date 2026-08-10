import { NextRequest, NextResponse } from "next/server";
import { listServers, saveServers, redactConfig, listTools, connect } from "@/lib/mcp";
import type { McpServerConfig } from "@/lib/mcp";

export async function GET() {
  const servers = listServers();
  const results = await Promise.all(
    servers.map(async (s) => {
      const redacted = redactConfig(s);
      if (s.enabled) {
        try {
          const tools = await listTools(s.id);
          return { ...redacted, tools };
        } catch (e) {
          return { ...redacted, error: (e as Error).message, tools: [] };
        }
      }
      return { ...redacted, tools: [] };
    })
  );
  return NextResponse.json({ servers: results });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Partial<McpServerConfig> | null;
  if (!body || typeof body.id !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(body.id)) {
    return NextResponse.json({ ok: false, error: "valid server id is required" }, { status: 400 });
  }
  if (body.transport !== "stdio" && body.transport !== "http") {
    return NextResponse.json({ ok: false, error: "transport must be stdio or http" }, { status: 400 });
  }
  if (body.transport === "stdio") {
    const command = typeof body.command === "string" ? body.command.toLowerCase() : "";
    if (command && command !== "npx" && command !== "uvx") {
      return NextResponse.json({ ok: false, error: "stdio MCP servers must use npx or uvx" }, { status: 400 });
    }
    if (body.args !== undefined && (!Array.isArray(body.args) || body.args.length > 32 || body.args.some((arg) => typeof arg !== "string" || arg.length > 512 || /^(-c|--eval|-e)$/.test(arg)))) {
      return NextResponse.json({ ok: false, error: "invalid MCP arguments" }, { status: 400 });
    }
  }
  const servers = listServers();
  const idx = servers.findIndex((s) => s.id === body.id);

  if (idx >= 0) {
    // Merge, preserving secrets if not provided
    const existing = servers[idx];
    const updated = { ...existing, ...body } as McpServerConfig;
    if (body.env && existing.env) {
      updated.env = { ...existing.env };
      for (const [k, v] of Object.entries(body.env)) {
        if (v !== "••••") updated.env[k] = v as string;
      }
    }
    if (body.headers && existing.headers) {
      updated.headers = { ...existing.headers };
      for (const [k, v] of Object.entries(body.headers)) {
        if (v !== "••••") updated.headers[k] = v as string;
      }
    }
    servers[idx] = updated;
  } else {
    servers.push(body as McpServerConfig);
  }

  saveServers(servers);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const servers = listServers().filter((s) => s.id !== id);
  saveServers(servers);
  return NextResponse.json({ ok: true });
}
