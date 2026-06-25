"use client";

import { CliPanel } from "./_ui";

export default function CodexMcp() {
  return <CliPanel title="MCP servers" url="/api/codex/mcp" hint="Add via: codex mcp add <name> — shared tools every Codex session can call." />;
}
