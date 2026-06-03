import fs from "node:fs";
import path from "node:path";
import { VAULT_DIR } from "./paths";
import { AGENTS, getAgent } from "./registry";
import { logEvent } from "./logbook";

/*
  The Obsidian vault is the single source of shared memory. Layout:

  MissionControlVault/
    README.md                  index / dashboard entry note
    Activity/Activity Log.md    shared feed — every agent appends here
    Memory/Shared Knowledge.md  cross-agent knowledge base
    Agents/<Name>.md            per-agent memory note (Mission/Memory/Log)
    .obsidian/                  minimal config so Obsidian opens it cleanly
*/

export interface ActivityEntry {
  ts: string; // ISO
  agentId: string;
  agentName: string;
  action: string;
  detail?: string;
}

function agentNoteName(id: string): string {
  const a = getAgent(id);
  return (a?.name || id).replace(/[\\/:*?"<>|·]/g, "-").trim();
}

function p(...parts: string[]): string {
  return path.join(VAULT_DIR, ...parts);
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function read(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const ACTIVITY_FILE = () => p("Activity", "Activity Log.md");
const SHARED_FILE = () => p("Memory", "Shared Knowledge.md");
const AGENT_FILE = (id: string) => p("Agents", `${agentNoteName(id)}.md`);

export function vaultExists(): boolean {
  return fs.existsSync(p("README.md"));
}

export function ensureVault(): { created: boolean; dir: string } {
  if (vaultExists()) return { created: false, dir: VAULT_DIR };

  fs.mkdirSync(VAULT_DIR, { recursive: true });

  write(
    p("README.md"),
    `# Mission Control — Shared Memory Vault

This Obsidian vault is the **unified memory** for every coding agent wired into
Mission Control. Each agent keeps its own note under \`Agents/\`, every action is
written to the shared \`Activity Log\`, and durable cross-agent knowledge lives in
\`Shared Knowledge\`. Open this folder as a vault in Obsidian to browse the graph.

## Map
- [[Activity Log]] — live feed of what every agent is doing
- [[Shared Knowledge]] — durable, cross-agent facts and decisions
${AGENTS.map((a) => `- [[${agentNoteName(a.id)}]] — ${a.tagline}`).join("\n")}
`
  );

  write(
    ACTIVITY_FILE(),
    `---
type: activity-feed
---
# Activity Log

Newest first. Every agent appends here so the whole fleet sees what the others are doing.

## Feed
`
  );

  write(
    SHARED_FILE(),
    `---
type: shared-knowledge
---
# Shared Knowledge

Durable facts, decisions, and conventions shared across all agents. Link entries
to the agent that authored them, e.g. [[Claude Code]].

`
  );

  for (const a of AGENTS) {
    write(
      AGENT_FILE(a.id),
      `---
agent: ${a.id}
kind: ${a.kind}
accent: "${a.accent}"
---
# ${a.name}

> ${a.tagline}

## Mission
_Standing objective for this agent. Edit freely — it is read back into the agent's Mission Control page._

## Tools
${a.tools.map((t) => `- ${t}`).join("\n")}

## Memory
_Notes, preferences, and context that should persist across this agent's sessions._

## Log
_Auto-appended highlights from the shared feed._
`
    );
  }

  // Minimal Obsidian config so the folder opens as a vault without prompts.
  write(
    p(".obsidian", "app.json"),
    JSON.stringify({ alwaysUpdateLinks: true, newLinkFormat: "shortest" }, null, 2)
  );
  write(
    p(".obsidian", "graph.json"),
    JSON.stringify({ collapse: false, showTags: true }, null, 2)
  );

  return { created: true, dir: VAULT_DIR };
}

export function readAgentMemory(id: string): string {
  ensureVault();
  return read(AGENT_FILE(id)) ?? "";
}

export function writeAgentMemory(id: string, content: string): void {
  ensureVault();
  write(AGENT_FILE(id), content);
  logEvent({ source: "vault", level: "info", event: "agent note saved", detail: getAgent(id)?.name ?? id });
}

export function readSharedKnowledge(): string {
  ensureVault();
  return read(SHARED_FILE()) ?? "";
}

export function writeSharedKnowledge(content: string): void {
  ensureVault();
  write(SHARED_FILE(), content);
  logEvent({ source: "vault", level: "info", event: "shared knowledge saved" });
}

export function appendActivity(entry: Omit<ActivityEntry, "ts">): ActivityEntry {
  ensureVault();
  const full: ActivityEntry = { ...entry, ts: new Date().toISOString() };
  const file = ACTIVITY_FILE();
  const existing = read(file) ?? "## Feed\n";
  const line = `- \`${full.ts}\` **[[${agentNoteName(full.agentId)}|${full.agentName}]]** — ${full.action}${
    full.detail ? ` · ${full.detail}` : ""
  }`;
  // Insert newest-first directly under the "## Feed" heading.
  const marker = "## Feed";
  const idx = existing.indexOf(marker);
  let next: string;
  if (idx === -1) {
    next = existing + `\n${marker}\n${line}\n`;
  } else {
    const head = existing.slice(0, idx + marker.length);
    const tail = existing.slice(idx + marker.length);
    next = `${head}\n${line}${tail}`;
  }
  write(file, next);
  logEvent({
    source: "agent",
    level: "info",
    event: full.action,
    detail: full.detail,
    meta: { agentId: full.agentId, agentName: full.agentName },
  });
  return full;
}

export function readActivity(limit = 100): ActivityEntry[] {
  ensureVault();
  const raw = read(ACTIVITY_FILE()) ?? "";
  const re =
    /^- `([^`]+)` \*\*\[\[[^|\]]+\|([^\]]+)\]\]\*\* — (.+?)(?: · (.+))?$/gm;
  const out: ActivityEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) && out.length < limit) {
    const name = m[2];
    const agent = AGENTS.find((a) => a.name === name);
    out.push({
      ts: m[1],
      agentName: name,
      agentId: agent?.id ?? name.toLowerCase(),
      action: m[3],
      detail: m[4],
    });
  }
  return out;
}

// ---- Vault file browser (powers the Antigravity IDE explorer) ----

export interface VaultNode {
  name: string;
  path: string; // POSIX-style, relative to the vault root
  dir: boolean;
  depth: number;
}

const VAULT_ROOT = () => path.resolve(VAULT_DIR);

/** Resolve a vault-relative path safely (no traversal outside the vault). */
function resolveInVault(rel: string): string | null {
  const root = VAULT_ROOT();
  const full = path.resolve(root, rel.replace(/^[/\\]+/, ""));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export function listVaultTree(): VaultNode[] {
  ensureVault();
  const root = VAULT_ROOT();
  const out: VaultNode[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries
      .filter((e) => e.name !== ".obsidian")
      .sort((a, b) =>
        a.isDirectory() === b.isDirectory()
          ? a.name.localeCompare(b.name)
          : a.isDirectory()
            ? -1
            : 1
      )
      .forEach((e) => {
        const full = path.join(dir, e.name);
        out.push({
          name: e.name,
          path: path.relative(root, full).split(path.sep).join("/"),
          dir: e.isDirectory(),
          depth,
        });
        if (e.isDirectory() && depth < 3) walk(full, depth + 1);
      });
  };
  walk(root, 0);
  return out;
}

export function readVaultFile(rel: string): { path: string; content: string } | null {
  const full = resolveInVault(rel);
  if (!full) return null;
  try {
    if (!fs.statSync(full).isFile()) return null;
    return { path: rel.replace(/^[/\\]+/, ""), content: fs.readFileSync(full, "utf8") };
  } catch {
    return null;
  }
}

export function writeVaultFile(rel: string, content: string): boolean {
  const full = resolveInVault(rel);
  if (!full) return false;
  try {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
    logEvent({ source: "vault", level: "info", event: "file saved", detail: rel.replace(/^[/\\]+/, "") });
    return true;
  } catch {
    return false;
  }
}

export { VAULT_DIR };
