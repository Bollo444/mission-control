import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import TOML from "@iarna/toml";
import type { AgentDef } from "./registry";
import { countSessions } from "./sessions";

export interface ConfigView {
  path: string;
  exists: boolean;
  kind: "toml" | "json" | "dir" | "missing";
  /** Flattened top-level keys for quick scanning. */
  keys?: string[];
  /** Truncated pretty preview of the parsed content. */
  preview?: string;
  /** For dir configs: entry names. */
  entries?: string[];
  error?: string;
}

export interface AgentStatus {
  id: string;
  installed: boolean;
  binPath: string | null;
  version: string | null;
  configs: ConfigView[];
  hasConfig: boolean;
  sessionCount: number;
  lastActive: string | null; // ISO
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a binary from explicit paths first, then PATH. */
export function resolveBinary(def: AgentDef): string | null {
  for (const p of def.binPaths ?? []) {
    if (exists(p)) return p;
  }
  if (!def.bin) return null;
  const pathEnv = process.env.PATH || process.env.Path || "";
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, def.bin + ext);
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function getVersion(binPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Node 20+ refuses to spawn .cmd/.bat without a shell (throws EINVAL),
    // so route batch shims through cmd.exe; run executables directly.
    const isBatch = process.platform === "win32" && /\.(cmd|bat)$/i.test(binPath);
    const file = isBatch ? process.env.ComSpec || "cmd.exe" : binPath;
    const args = isBatch ? ["/c", binPath, "--version"] : ["--version"];
    try {
      const child = execFile(
        file,
        args,
        { timeout: 2500, windowsHide: true },
        (err, stdout, stderr) => {
          if (err) return resolve(null);
          const out = (stdout || stderr || "").trim().split("\n")[0];
          resolve(out ? out.slice(0, 80) : null);
        }
      );
      child.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

function readConfig(p: string, fmt: AgentDef["configFormat"]): ConfigView {
  if (!exists(p)) {
    return { path: p, exists: false, kind: "missing" };
  }
  try {
    const stat = fs.statSync(p);
    if (stat.isDirectory() || fmt === "dir") {
      const entries = fs.readdirSync(p).slice(0, 40);
      return { path: p, exists: true, kind: "dir", entries };
    }
    const raw = fs.readFileSync(p, "utf8");
    if (fmt === "toml" || p.endsWith(".toml")) {
      const parsed = TOML.parse(raw);
      return {
        path: p,
        exists: true,
        kind: "toml",
        keys: Object.keys(parsed),
        preview: truncate(raw, 4000),
      };
    }
    // default JSON
    const parsed = JSON.parse(raw);
    return {
      path: p,
      exists: true,
      kind: "json",
      keys: Object.keys(parsed),
      preview: truncate(JSON.stringify(parsed, null, 2), 4000),
    };
  } catch (e) {
    return {
      path: p,
      exists: true,
      kind: fmt === "toml" ? "toml" : "json",
      error: (e as Error).message,
      preview: tryRaw(p),
    };
  }
}

function tryRaw(p: string): string | undefined {
  try {
    return truncate(fs.readFileSync(p, "utf8"), 2000);
  } catch {
    return undefined;
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "\n… (truncated)" : s;
}

export async function getAgentStatus(def: AgentDef): Promise<AgentStatus> {
  const binPath = resolveBinary(def);
  const configs = (def.configPaths ?? []).map((p) => readConfig(p, def.configFormat));
  const hasConfig = configs.some((c) => c.exists);
  const version = binPath ? await getVersion(binPath) : null;
  const sessions = countSessions(def);

  return {
    id: def.id,
    installed: Boolean(binPath) || hasConfig,
    binPath,
    version,
    configs,
    hasConfig,
    sessionCount: sessions.count,
    lastActive: sessions.lastActive,
  };
}
