/**
 * hermes-data.ts
 *
 * Typed helpers for reading Hermes on-disk data. All reads are READ-ONLY
 * except the two documented toggle functions (toolset enable/disable and
 * skill enable/disable). Never executes Python; parses toolsets.py with
 * regex.
 *
 * Exported response interfaces are the authoritative shapes consumed by the
 * five /api/hermes/* routes.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

// ---------------------------------------------------------------------------
// HERMES_HOME
// ---------------------------------------------------------------------------

export function hermesHome(...parts: string[]): string {
  const base =
    process.env.HERMES_HOME ||
    path.join(
      process.env.LOCALAPPDATA ||
        path.join(os.homedir(), "AppData", "Local"),
      "hermes"
    );
  return parts.length ? path.join(base, ...parts) : base;
}

// ---------------------------------------------------------------------------
// Response interfaces (exported so the frontend can import them)
// ---------------------------------------------------------------------------

export interface ToolsetItem {
  name: string;
  keyword: string;
  description: string;
  toolCount: number;
  enabled: boolean;
}

export interface ToolsetsResp {
  installed: number;
  enabled: number;
  toolsets: ToolsetItem[];
}

export interface SkillItem {
  name: string;
  description: string;
  enabled: boolean;
}

export interface CategoryItem {
  category: string;
  description: string;
  installed: number;
  enabled: number;
  skills: SkillItem[];
}

export interface SkillsResp {
  totalInstalled: number;
  totalEnabled: number;
  categories: CategoryItem[];
}

export interface ProfileItem {
  name: string;
  isDefault: boolean;
  description: string;
  model: string | null;
  soul: string | null;
  skillCount: number;
}

export interface ProfilesResp {
  active: number;
  profiles: ProfileItem[];
}

export interface SessionItem {
  id: string;
  title: string | null;
  startedAt: number | null;
  messageCount: number;
  model: string | null;
  parentSessionId: string | null;
}

export interface SessionsResp {
  sessions: SessionItem[];
}

export interface ArtifactItem {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

export interface ArtifactCategory {
  category: string;
  count: number;
  items: ArtifactItem[];
}

export interface ArtifactsResp {
  categories: ArtifactCategory[];
}

// ---------------------------------------------------------------------------
// 1) TOOLSETS helpers
// ---------------------------------------------------------------------------

/**
 * Parse toolsets.py with regex — no Python execution.
 * Returns a map of name → { description, toolCount }.
 */
function parseToolsetsPy(): Map<
  string,
  { description: string; toolCount: number }
> {
  const result = new Map<string, { description: string; toolCount: number }>();
  const pyPath = hermesHome("hermes-agent", "toolsets.py");
  let src: string;
  try {
    src = fs.readFileSync(pyPath, "utf8");
  } catch {
    return result;
  }

  // Match each top-level key in TOOLSETS = { ... }.
  // Strategy: scan for  "name": {  blocks and grab description + tools list length.
  // We do a single pass with a stateful regex over the whole file.
  const topKeyRe =
    /^\s{4}"([^"]+)":\s*\{/gm;
  let m: RegExpExecArray | null;

  while ((m = topKeyRe.exec(src)) !== null) {
    const name = m[1];
    const blockStart = m.index + m[0].length;

    // Extract the description string (may be a simple string, concat, or multiline)
    let description = "";
    const descMatch = src
      .slice(blockStart, blockStart + 800)
      .match(/["']description["']\s*:\s*(?:\(\s*)?(["'])([\s\S]*?)\1/);
    if (descMatch) {
      description = descMatch[2].replace(/\\\n\s*/g, " ").trim();
    }

    // Count tools list entries: scan for  "tools": [...]  in the next ~2000 chars
    let toolCount = 0;
    const toolsMatch = src
      .slice(blockStart, blockStart + 2000)
      .match(/["']tools["']\s*:\s*(\[[^\]]*?\]|\w[^,\n}]*)/s);
    if (toolsMatch) {
      const listText = toolsMatch[1];
      // count quoted strings inside
      const items = listText.match(/"[^"]+"|'[^']+'/g);
      toolCount = items ? items.length : 0;
    }

    result.set(name, { description, toolCount });
  }

  return result;
}

/** Read config.yaml and return enabled/disabled toolset lists. */
function readToolsetConfig(): {
  enabled: string[];
  disabled: string[];
  raw: Record<string, unknown>;
} {
  const cfgPath = hermesHome("config.yaml");
  let raw: Record<string, unknown> = {};
  try {
    const text = fs.readFileSync(cfgPath, "utf8");
    raw = (parseYaml(text) as Record<string, unknown>) ?? {};
  } catch {
    /* graceful degradation */
  }

  const toolsets = raw.toolsets;
  const enabled = Array.isArray(toolsets)
    ? (toolsets as string[]).filter((v) => typeof v === "string")
    : [];

  const agent = raw.agent as Record<string, unknown> | undefined;
  const disabledToolsets = agent?.disabled_toolsets;
  const disabled = Array.isArray(disabledToolsets)
    ? (disabledToolsets as string[]).filter((v) => typeof v === "string")
    : [];

  return { enabled, disabled, raw };
}

export function getToolsets(): ToolsetsResp {
  const parsed = parseToolsetsPy();
  const { enabled, disabled } = readToolsetConfig();
  const disabledSet = new Set(disabled);

  const toolsets: ToolsetItem[] = [];
  for (const [name, { description, toolCount }] of parsed.entries()) {
    const isEnabled = enabled.includes(name) && !disabledSet.has(name);
    toolsets.push({
      name,
      keyword: name,
      description,
      toolCount,
      enabled: isEnabled,
    });
  }
  toolsets.sort((a, b) => a.name.localeCompare(b.name));

  const enabledCount = toolsets.filter((t) => t.enabled).length;
  return { installed: toolsets.length, enabled: enabledCount, toolsets };
}

/**
 * Toggle a toolset on or off by rewriting config.yaml's `toolsets:` list.
 * Uses the yaml package to round-trip so the rest of the 560-line file is
 * preserved.
 */
export function setToolsetEnabled(name: string, enable: boolean): void {
  const cfgPath = hermesHome("config.yaml");
  const text = fs.readFileSync(cfgPath, "utf8");
  const doc = parseYaml(text) as Record<string, unknown>;

  const toolsets = Array.isArray(doc.toolsets) ? (doc.toolsets as string[]) : [];

  if (enable) {
    if (!toolsets.includes(name)) toolsets.push(name);
  } else {
    const idx = toolsets.indexOf(name);
    if (idx !== -1) toolsets.splice(idx, 1);
  }

  doc.toolsets = toolsets;

  // Re-stringify and write back
  const out = stringifyYaml(doc, { lineWidth: 0 });
  fs.writeFileSync(cfgPath, out, "utf8");
}

// ---------------------------------------------------------------------------
// 2) SKILLS helpers
// ---------------------------------------------------------------------------

interface UsageEntry {
  state?: string;
  [k: string]: unknown;
}

function readUsageJson(): Record<string, UsageEntry> {
  const p = hermesHome("skills", ".usage.json");
  try {
    const text = fs.readFileSync(p, "utf8");
    return JSON.parse(text) as Record<string, UsageEntry>;
  } catch {
    return {};
  }
}

function writeUsageJson(usage: Record<string, UsageEntry>): void {
  const p = hermesHome("skills", ".usage.json");
  fs.writeFileSync(p, JSON.stringify(usage, null, 2), "utf8");
}

function parseFrontmatter(text: string): { name?: string; description?: string } {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("---", 3);
  if (end === -1) return {};
  const block = text.slice(3, end).trim();
  // Simple key: value extraction for name and description
  const nameM = block.match(/^name\s*:\s*["']?([^"'\n]+)["']?/m);
  const descM = block.match(/^description\s*:\s*["']?([^"'\n]+)["']?/m);
  return {
    name: nameM ? nameM[1].trim() : undefined,
    description: descM ? descM[1].trim() : undefined,
  };
}

function readFirstNonEmptyLine(p: string): string {
  try {
    const text = fs.readFileSync(p, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.replace(/^#+\s*/, "").trim();
      if (trimmed) return trimmed;
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function getSkills(): SkillsResp {
  const skillsDir = hermesHome("skills");
  const usage = readUsageJson();

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(skillsDir).filter((e) => !e.startsWith("."));
  } catch {
    return { totalInstalled: 0, totalEnabled: 0, categories: [] };
  }

  const categories: CategoryItem[] = [];
  let totalInstalled = 0;
  let totalEnabled = 0;

  for (const cat of entries.sort()) {
    const catDir = path.join(skillsDir, cat);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(catDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const descPath = path.join(catDir, "DESCRIPTION.md");
    const catDescription = readFirstNonEmptyLine(descPath);

    let skillDirs: string[] = [];
    try {
      skillDirs = fs.readdirSync(catDir).filter((e) => !e.startsWith("."));
    } catch {
      continue;
    }

    const skills: SkillItem[] = [];
    for (const skillDir of skillDirs.sort()) {
      const skillPath = path.join(catDir, skillDir);
      let sStat: fs.Stats;
      try {
        sStat = fs.statSync(skillPath);
      } catch {
        continue;
      }
      if (!sStat.isDirectory()) continue;

      const skillMdPath = path.join(skillPath, "SKILL.md");
      let skillText = "";
      try {
        skillText = fs.readFileSync(skillMdPath, "utf8");
      } catch {
        continue; // not a skill dir if SKILL.md missing
      }

      const { name, description } = parseFrontmatter(skillText);
      const skillName = name || skillDir;
      const usageEntry = usage[skillName];
      const enabled =
        !usageEntry || usageEntry.state !== "archived";

      skills.push({
        name: skillName,
        description: description || "",
        enabled,
      });

      totalInstalled++;
      if (enabled) totalEnabled++;
    }

    if (skills.length > 0) {
      categories.push({
        category: cat,
        description: catDescription,
        installed: skills.length,
        enabled: skills.filter((s) => s.enabled).length,
        skills,
      });
    }
  }

  return { totalInstalled, totalEnabled, categories };
}

export function setSkillEnabled(skillName: string, enable: boolean): void {
  const usage = readUsageJson();
  const now = new Date().toISOString();
  if (!usage[skillName]) {
    usage[skillName] = {
      state: enable ? "active" : "archived",
      created_at: now,
      last_used_at: now,
      use_count: 0,
    };
  } else {
    usage[skillName].state = enable ? "active" : "archived";
    if (!enable) {
      usage[skillName].archived_at = now;
    }
  }
  writeUsageJson(usage);
}

// ---------------------------------------------------------------------------
// 3) PROFILES helpers
// ---------------------------------------------------------------------------

function countSkillsInDir(skillsDir: string): number {
  try {
    let count = 0;
    const cats = fs.readdirSync(skillsDir).filter((e) => !e.startsWith("."));
    for (const cat of cats) {
      const catDir = path.join(skillsDir, cat);
      try {
        if (!fs.statSync(catDir).isDirectory()) continue;
        const skills = fs
          .readdirSync(catDir)
          .filter((e) => !e.startsWith("."));
        for (const s of skills) {
          const sp = path.join(catDir, s);
          try {
            if (
              fs.statSync(sp).isDirectory() &&
              fs.existsSync(path.join(sp, "SKILL.md"))
            ) {
              count++;
            }
          } catch {
            /* skip */
          }
        }
      } catch {
        /* skip */
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function readProfileDir(
  name: string,
  dirPath: string,
  isDefault: boolean,
  defaultSkillCount: number
): ProfileItem {
  // description from profile.yaml
  let description = "";
  let model: string | null = null;
  const profileYamlPath = path.join(dirPath, "profile.yaml");
  try {
    const text = fs.readFileSync(profileYamlPath, "utf8");
    const doc = parseYaml(text) as Record<string, unknown>;
    description =
      (doc.description as string) ||
      (doc.description_auto as string) ||
      "";
  } catch {
    /* no profile.yaml */
  }

  // model from config.yaml
  const configYamlPath = path.join(dirPath, "config.yaml");
  try {
    const text = fs.readFileSync(configYamlPath, "utf8");
    const doc = parseYaml(text) as Record<string, unknown>;
    const modelBlock = doc.model as Record<string, unknown> | undefined;
    if (modelBlock) {
      model = (modelBlock.default as string) || null;
    }
  } catch {
    /* no config.yaml */
  }

  // soul from SOUL.md
  let soul: string | null = null;
  const soulPath = path.join(dirPath, "SOUL.md");
  try {
    const text = fs.readFileSync(soulPath, "utf8");
    soul = text.slice(0, 200);
  } catch {
    /* no SOUL.md */
  }

  // skillCount
  const profileSkillsDir = path.join(dirPath, "skills");
  let skillCount = defaultSkillCount;
  if (fs.existsSync(profileSkillsDir)) {
    skillCount = countSkillsInDir(profileSkillsDir);
  }

  return { name, isDefault, description, model, soul, skillCount };
}

export function getProfiles(): ProfilesResp {
  const home = hermesHome();
  const defaultSkillCount = countSkillsInDir(hermesHome("skills"));

  const profiles: ProfileItem[] = [];

  // Default profile = hermesHome itself
  profiles.push(readProfileDir("default", home, true, defaultSkillCount));

  // Named profiles under profiles/
  const profilesDir = hermesHome("profiles");
  if (fs.existsSync(profilesDir)) {
    let names: string[] = [];
    try {
      names = fs
        .readdirSync(profilesDir)
        .filter((e) => !e.startsWith("."))
        .sort();
    } catch {
      /* no profiles dir */
    }
    for (const name of names) {
      const dirPath = path.join(profilesDir, name);
      try {
        if (!fs.statSync(dirPath).isDirectory()) continue;
      } catch {
        continue;
      }
      profiles.push(
        readProfileDir(name, dirPath, false, defaultSkillCount)
      );
    }
  }

  return { active: profiles.length, profiles };
}

/** Create a named subagent profile dir under the Hermes home (profile.yaml +
 *  optional config.yaml/SOUL.md). Name is sanitized to a safe dir segment. */
export function createProfile(
  name: string,
  opts: { description?: string; model?: string; soul?: string }
): { ok: boolean; error?: string } {
  const safe = (name ?? "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safe) return { ok: false, error: "name must be alphanumeric / - / _" };
  if (safe === "default") return { ok: false, error: "'default' is reserved" };
  const dir = hermesHome("profiles", safe);
  if (fs.existsSync(dir)) return { ok: false, error: "a profile with that name already exists" };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "profile.yaml"),
      stringifyYaml({ description: (opts.description ?? "").trim() }),
      "utf8"
    );
    if (opts.model?.trim()) {
      fs.writeFileSync(
        path.join(dir, "config.yaml"),
        stringifyYaml({ model: { default: opts.model.trim() } }),
        "utf8"
      );
    }
    if (opts.soul?.trim()) {
      fs.writeFileSync(path.join(dir, "SOUL.md"), opts.soul.trim() + "\n", "utf8");
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// 4) SESSIONS helpers (sql.js, pure-JS wasm, no native module)
// ---------------------------------------------------------------------------

/**
 * Open the Hermes state.db with sql.js (pure-JS wasm). Returns null if the DB
 * doesn't exist. Caller owns the returned db and must call db.close().
 *
 * Resolve the wasm via cwd, NOT require.resolve(): webpack rewrites
 * require.resolve() to a numeric module id at build time, so
 * path.dirname(<number>) throws. pm2 runs from the project root, so cwd
 * reliably points at node_modules.
 */
async function loadStateDb(): Promise<SqlJsDatabase | null> {
  const dbPath = hermesHome("state.db");
  if (!fs.existsSync(dbPath)) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require("sql.js") as (
    opts?: Record<string, unknown>
  ) => Promise<{ Database: new (data: Uint8Array) => SqlJsDatabase }>;
  const wasmPath = path.join(
    process.cwd(),
    "node_modules",
    "sql.js",
    "dist",
    "sql-wasm.wasm"
  );
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  return new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)));
}

export async function getSessions(): Promise<SessionsResp> {
  try {
    const db = await loadStateDb();
    if (!db) return { sessions: [] };

    let rows: SessionItem[] = [];
    try {
      const stmt = db.prepare(
        `SELECT id, title, started_at, message_count, model, parent_session_id
         FROM sessions
         WHERE archived = 0
         ORDER BY started_at DESC
         LIMIT 100`
      );
      while (stmt.step()) {
        const r = stmt.getAsObject() as Record<string, unknown>;
        rows.push({
          id: String(r.id ?? ""),
          title: r.title != null ? String(r.title) : null,
          startedAt: r.started_at != null ? Number(r.started_at) : null,
          messageCount: Number(r.message_count ?? 0),
          model: r.model != null ? String(r.model) : null,
          parentSessionId:
            r.parent_session_id != null
              ? String(r.parent_session_id)
              : null,
        });
      }
      stmt.free();
    } catch (queryErr) {
      console.error("[hermes-data] sessions query failed:", queryErr);
      rows = [];
    }

    db.close();
    return { sessions: rows };
  } catch (err) {
    console.error("[hermes-data] getSessions error:", err);
    return { sessions: [] };
  }
}

export interface SessionMessage {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
  timestamp: number | null;
}
export interface SessionTranscriptResp {
  messages: SessionMessage[];
}

/** Read a single session's transcript (messages) from state.db, oldest-first. */
export async function getSessionMessages(
  sessionId: string
): Promise<SessionTranscriptResp> {
  try {
    const db = await loadStateDb();
    if (!db) return { messages: [] };

    const messages: SessionMessage[] = [];
    try {
      const stmt = db.prepare(
        `SELECT id, role, content, tool_name, timestamp
         FROM messages
         WHERE session_id = ?
         ORDER BY timestamp ASC, id ASC
         LIMIT 2000`
      );
      stmt.bind([sessionId]);
      while (stmt.step()) {
        const r = stmt.getAsObject() as Record<string, unknown>;
        messages.push({
          id: String(r.id ?? ""),
          role: r.role != null ? String(r.role) : "",
          content: r.content != null ? String(r.content) : "",
          toolName: r.tool_name != null ? String(r.tool_name) : null,
          timestamp: r.timestamp != null ? Number(r.timestamp) : null,
        });
      }
      stmt.free();
    } catch (queryErr) {
      console.error("[hermes-data] transcript query failed:", queryErr);
    }

    db.close();
    return { messages };
  } catch (err) {
    console.error("[hermes-data] getSessionMessages error:", err);
    return { messages: [] };
  }
}

// Minimal type shim for sql.js Database
interface SqlJsDatabase {
  prepare(sql: string): SqlJsStatement;
  close(): void;
}
interface SqlJsStatement {
  bind(values: unknown[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

// ---------------------------------------------------------------------------
// 5) ARTIFACTS helpers
// ---------------------------------------------------------------------------

const MAX_ITEMS_PER_CATEGORY = 50;

function collectFiles(
  dir: string,
  recursive: boolean,
  excludeExt?: string
): ArtifactItem[] {
  const items: ArtifactItem[] = [];
  if (!fs.existsSync(dir)) return items;

  function walk(d: string) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(d);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.endsWith(".lock")) continue;
      const fullPath = path.join(d, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (recursive) walk(fullPath);
      } else {
        items.push({
          name: entry,
          path: fullPath,
          size: stat.size,
          mtime: stat.mtimeMs,
        });
      }
    }
  }

  walk(dir);
  return items;
}

export function getArtifacts(): ArtifactsResp {
  const categorySources: Array<{
    category: string;
    dirs: string[];
    recursive: boolean;
  }> = [
    {
      category: "Audio",
      dirs: [hermesHome("audio_cache")],
      recursive: true,
    },
    {
      category: "Images",
      dirs: [hermesHome("image_cache")],
      recursive: true,
    },
    {
      category: "Memories",
      dirs: [hermesHome("memories")],
      recursive: true,
    },
    {
      category: "Plans",
      dirs: [
        hermesHome("plans"),
        // profiles/*/plans/
        ...((): string[] => {
          const profilesDir = hermesHome("profiles");
          const results: string[] = [];
          if (!fs.existsSync(profilesDir)) return results;
          try {
            const names = fs.readdirSync(profilesDir);
            for (const n of names) {
              const p = path.join(profilesDir, n, "plans");
              if (fs.existsSync(p)) results.push(p);
            }
          } catch {
            /* ignore */
          }
          return results;
        })(),
      ],
      recursive: true,
    },
    {
      category: "Snapshots",
      dirs: [hermesHome("state-snapshots")],
      recursive: true,
    },
    {
      category: "Transcripts",
      dirs: [hermesHome("sessions")],
      recursive: false,
    },
    {
      category: "Cron Outputs",
      dirs: [hermesHome("cron", "output")],
      recursive: true,
    },
    {
      category: "Shared",
      dirs: [hermesHome("shared")],
      recursive: true,
    },
  ];

  const categoryMap: ArtifactCategory[] = [];

  for (const { category, dirs, recursive } of categorySources) {
    let allItems: ArtifactItem[] = [];
    for (const dir of dirs) {
      allItems = allItems.concat(collectFiles(dir, recursive));
    }
    if (allItems.length === 0) continue;
    allItems.sort((a, b) => b.mtime - a.mtime); // newest first
    categoryMap.push({
      category,
      count: allItems.length,
      items: allItems.slice(0, MAX_ITEMS_PER_CATEGORY),
    });
  }

  categoryMap.sort((a, b) => a.category.localeCompare(b.category));
  return { categories: categoryMap };
}
