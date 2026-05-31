import fs from "node:fs";
import path from "node:path";
import type { AgentDef } from "./registry";

export interface SessionMeta {
  agentId: string;
  id: string;
  title: string;
  path: string;
  mtime: string; // ISO
  sizeKB: number;
  messages: number | null;
  project?: string;
}

interface FileHit {
  path: string;
  mtime: number;
}

function safeStat(p: string): fs.Stats | null {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

/** Collect files under dir up to a depth, filtered by predicate. */
function walk(dir: string, depth: number, keep: (f: string) => boolean): FileHit[] {
  const out: FileHit[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (depth > 0) out.push(...walk(full, depth - 1, keep));
    } else if (keep(full)) {
      const st = safeStat(full);
      if (st) out.push({ path: full, mtime: st.mtimeMs });
    }
  }
  return out;
}

function filesFor(def: AgentDef): FileHit[] {
  const dir = def.sessionsDir;
  if (!dir || !safeStat(dir)) return [];
  switch (def.sessionFormat) {
    case "claude":
      return walk(dir, 2, (f) => f.endsWith(".jsonl"));
    case "jcode":
      return walk(dir, 1, (f) => /session_.*\.json$/.test(f) && !f.endsWith(".bak"));
    case "vibe":
      return walk(dir, 1, (f) => /\.(jsonl|json|log)$/.test(f));
    case "generic":
      return walk(dir, 1, (f) => /\.(jsonl|json|log|md)$/.test(f));
    default:
      return [];
  }
}

export function countSessions(def: AgentDef): {
  count: number;
  lastActive: string | null;
} {
  const files = filesFor(def);
  if (files.length === 0) return { count: 0, lastActive: null };
  const last = Math.max(...files.map((f) => f.mtime));
  return { count: files.length, lastActive: new Date(last).toISOString() };
}

function deriveClaudeTitle(p: string): { title: string; messages: number | null } {
  try {
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    let title = "";
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const content = obj?.message?.content ?? obj?.content;
        if (obj?.type === "user" || obj?.role === "user") {
          const text =
            typeof content === "string"
              ? content
              : Array.isArray(content)
                ? content.map((c: { text?: string }) => c?.text).filter(Boolean).join(" ")
                : "";
          if (text && !text.startsWith("<")) {
            title = text;
            break;
          }
        }
      } catch {
        /* skip malformed line */
      }
    }
    return { title: title.slice(0, 90) || "Untitled session", messages: lines.length };
  } catch {
    return { title: "Untitled session", messages: null };
  }
}

/** Coerce a possibly-structured message content field into a plain string. */
function textOf(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v))
    return v
      .map((c) => (typeof c === "string" ? c : (c as { text?: string })?.text ?? ""))
      .filter(Boolean)
      .join(" ");
  if (v && typeof v === "object") {
    const o = v as { text?: string; content?: unknown };
    if (typeof o.text === "string") return o.text;
    if (o.content != null) return textOf(o.content);
  }
  return "";
}

function deriveJsonTitle(p: string): { title: string; messages: number | null } {
  try {
    const obj = JSON.parse(fs.readFileSync(p, "utf8"));
    // Prefer the first human-authored message that isn't injected context.
    let firstMsg = "";
    if (Array.isArray(obj.messages)) {
      for (const msg of obj.messages) {
        const t = textOf(msg?.content).trim();
        if (t && !t.startsWith("<")) {
          firstMsg = t;
          break;
        }
      }
    }
    const title =
      textOf(obj.title) ||
      textOf(obj.name) ||
      textOf(obj.summary) ||
      textOf(obj.first_message) ||
      firstMsg ||
      "";
    const messages = Array.isArray(obj.messages) ? obj.messages.length : null;
    const clean = title.replace(/\s+/g, " ").trim();
    return { title: clean.slice(0, 90) || "Session", messages };
  } catch {
    return { title: "Session", messages: null };
  }
}

export function listSessions(def: AgentDef, limit = 50): SessionMeta[] {
  const files = filesFor(def)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);

  return files.map((f) => {
    const st = safeStat(f.path);
    let title = path.basename(f.path);
    let messages: number | null = null;
    if (def.sessionFormat === "claude") {
      const d = deriveClaudeTitle(f.path);
      title = d.title;
      messages = d.messages;
    } else if (f.path.endsWith(".json")) {
      const d = deriveJsonTitle(f.path);
      title = d.title;
      messages = d.messages;
    }
    // Unique id per session: the path relative to the agent's session root.
    // (Basenames like "meta.json" repeat across session folders.)
    const rel = def.sessionsDir
      ? path.relative(def.sessionsDir, f.path).split(path.sep).join("/")
      : path.basename(f.path);
    const parent = path.basename(path.dirname(f.path));
    return {
      agentId: def.id,
      id: rel || path.basename(f.path),
      title,
      path: f.path,
      mtime: new Date(f.mtime).toISOString(),
      sizeKB: st ? Math.round((st.size / 1024) * 10) / 10 : 0,
      messages,
      project:
        def.sessionFormat === "claude"
          ? parent
          : parent !== path.basename(def.sessionsDir ?? "")
            ? parent
            : undefined,
    };
  });
}
