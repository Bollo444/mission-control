import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { getGatewayToken } from "./settings";

/* ------------------------------------------------------------------ *
 * Codex data layer. Shells out to the real `codex` CLI for live data   *
 * (plugins, MCP, cloud, review) and reads ~/.codex for config/sessions.*
 * alignGateway() makes Codex run on the free Mission Control gateway.   *
 * ------------------------------------------------------------------ */

export function codexHome(...p: string[]): string {
  const base = path.join(os.homedir(), ".codex");
  return p.length ? path.join(base, ...p) : base;
}

/** Run a codex subcommand, shell-safe for the .cmd shim. Returns captured text. */
export function runCodex(args: string[], timeoutMs = 20_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const def = getAgent("codex");
    const bin = def ? resolveBinary(def) : null;
    if (!bin) return resolve({ ok: false, out: "Codex is not installed." });
    const needsShell = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);
    let out = "";
    let done = false;
    const finish = (ok: boolean) => { if (!done) { done = true; resolve({ ok, out: out.slice(-20000) }); } };
    try {
      const child = spawn(bin, args, { shell: needsShell, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.on("data", (c) => (out += c.toString()));
      child.stderr?.on("data", (c) => (out += c.toString()));
      const t = setTimeout(() => { try { child.kill(); } catch {} finish(false); }, timeoutMs);
      child.on("exit", (code) => { clearTimeout(t); finish(code === 0); });
      child.on("error", (e) => { clearTimeout(t); out += e.message; finish(false); });
    } catch (e) {
      finish(false);
      out += (e as Error).message;
    }
  });
}

// ---- Gateway alignment -----------------------------------------------------

const GATEWAY_URL = "http://127.0.0.1:4317/api/gateway/v1";

export interface CodexConfigState {
  gatewayAligned: boolean;
  model: string | null;
  provider: string | null;
  agentsMd: boolean;
}

export function getCodexConfig(): CodexConfigState {
  const cfg = codexHome("config.toml");
  let text = "";
  try { text = fs.readFileSync(cfg, "utf8"); } catch { /* none */ }
  const aligned = text.includes("mission-control") && text.includes(GATEWAY_URL);
  const model = /(^|\n)\s*model\s*=\s*"([^"]+)"/.exec(text)?.[2] ?? null;
  const provider = /(^|\n)\s*model_provider\s*=\s*"([^"]+)"/.exec(text)?.[2] ?? null;
  return { gatewayAligned: aligned, model, provider, agentsMd: fs.existsSync(codexHome("AGENTS.md")) };
}

const AGENTS_MD = `# Codex — Mission Control fleet agent

You are **Codex**, the extensibility & tooling specialist in a local AI agent fleet
("Mission Control"). You run on the fleet's free gateway, not a paid OpenAI account.

## Standing instructions
- Prefer packaging reusable capability as **plugins** or **MCP tools** over one-off scripts.
- Run anything risky in a **sandbox**: propose a plan, let it be reviewed, then apply — never blind execution on the user's machine.
- Authorized work only. Stay in scope; surface diffs for review.
- Keep answers concrete and code-first.
`;

/** Write config.toml + AGENTS.md + .env so Codex runs on the free gateway. Idempotent. */
export function alignGateway(): { ok: boolean; wrote: string[]; error?: string } {
  const wrote: string[] = [];
  try {
    fs.mkdirSync(codexHome(), { recursive: true });
    const token = getGatewayToken();

    const config = `# Written by Mission Control — Codex on the free fleet gateway.
model = "auto"
model_provider = "mission-control"

[model_providers.mission-control]
name = "Mission Control Gateway"
base_url = "${GATEWAY_URL}"
env_key = "MC_GATEWAY_TOKEN"
wire_api = "responses"
`;
    fs.writeFileSync(codexHome("config.toml"), config, "utf8");
    wrote.push("config.toml");

    // Token in codex's env file so env_key resolves.
    const envPath = codexHome(".env");
    let env = "";
    try { env = fs.readFileSync(envPath, "utf8"); } catch { /* none */ }
    if (!env.includes("MC_GATEWAY_TOKEN")) {
      fs.writeFileSync(envPath, `${env}${env && !env.endsWith("\n") ? "\n" : ""}MC_GATEWAY_TOKEN=${token}\n`, "utf8");
      wrote.push(".env");
    }

    fs.writeFileSync(codexHome("AGENTS.md"), AGENTS_MD, "utf8");
    wrote.push("AGENTS.md");

    // Mission Control vault note.
    try {
      const vaultDir = process.env.MC_VAULT_DIR || path.join(os.homedir(), "MissionControlVault");
      const agentsDir = path.join(vaultDir, "Agents");
      if (fs.existsSync(vaultDir)) {
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, "Codex.md"), VAULT_NOTE, "utf8");
        wrote.push("vault/Agents/Codex.md");
      }
    } catch { /* vault optional */ }

    return { ok: true, wrote };
  } catch (e) {
    return { ok: false, wrote, error: (e as Error).message };
  }
}

const VAULT_NOTE = `# Codex

**Mission:** Extensibility & tooling — bring plugins, MCP servers, sandboxed execution
and code review to the fleet, running on the free gateway.

**Excels at:** packaging reusable capability (plugins/MCP), safe sandboxed exec,
non-interactive code review, session resume/fork.

**Memory:** Runs through the Mission Control gateway (model \`auto\`, free cascade).
Replaced the retired \`kilo\` slot.

**Log:**
`;

// ---- Live data via the CLI -------------------------------------------------

export const getPlugins = () => runCodex(["plugin", "list"]);
export const getMarketplaces = () => runCodex(["plugin", "marketplace", "list"]);
export const getMcpServers = () => runCodex(["mcp", "list"]);
export const getCloudTasks = () => runCodex(["cloud", "list"], 25_000);

export interface CodexProfile { name: string; body: string }
/** Custom prompts ("custom chatbots") live as files under ~/.codex/prompts. */
export function getPrompts(): CodexProfile[] {
  const dir = codexHome("prompts");
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter((f) => /\.(md|txt|toml)$/i.test(f))
      .slice(0, 100)
      .map((f) => {
        let body = "";
        try { body = fs.readFileSync(path.join(dir, f), "utf8").slice(0, 2000); } catch {}
        return { name: f.replace(/\.[^.]+$/, ""), body };
      });
  } catch {
    return [];
  }
}

export interface CodexSession { id: string; path: string; title: string; mtime: string; sizeKB: number }
/** Saved sessions on disk (location discovered under ~/.codex). */
export function getCodexSessions(): CodexSession[] {
  const roots = [codexHome("sessions"), codexHome("history"), codexHome("archived_sessions")];
  const out: CodexSession[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let entries: string[] = [];
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const e of entries) {
      const full = path.join(root, e);
      let st: fs.Stats;
      try { st = fs.statSync(full); } catch { continue; }
      if (!st.isFile()) continue;
      out.push({ id: e, path: full, title: e.replace(/\.[^.]+$/, ""), mtime: new Date(st.mtimeMs).toISOString(), sizeKB: Math.round((st.size / 1024) * 10) / 10 });
    }
  }
  return out.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, 100);
}

export const runReview = (target: string) => runCodex(["review", target], 120_000);
