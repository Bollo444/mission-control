import fs from "node:fs";
import path from "node:path";
import { AGENTS } from "./registry";
import { HOME, VAULT_DIR, MC_CONFIG_DIR, REPO_ROOT } from "./paths";

/* ------------------------------------------------------------------ *
 * System-file inventory for the edge drawer. We surface the files the  *
 * dashboard actually knows about — each agent's on-disk config, the    *
 * shared vault, and the app's own settings — grouped for a quick peek. *
 * Reads are allow-listed to these roots so the drawer can never be used *
 * to exfiltrate arbitrary files off the box.                           *
 * ------------------------------------------------------------------ */

export interface SysFile {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  mtime: number;
}

export interface SysGroup {
  id: string;
  label: string;
  accent?: string;
  files: SysFile[];
}

/** Roots a read is permitted under. Anything outside is refused. */
const ALLOWED_ROOTS = [VAULT_DIR, MC_CONFIG_DIR, REPO_ROOT];

function statFile(p: string): SysFile | null {
  try {
    const st = fs.statSync(p);
    return {
      name: path.basename(p),
      path: p,
      size: st.isDirectory() ? 0 : st.size,
      isDir: st.isDirectory(),
      mtime: st.mtimeMs,
    };
  } catch {
    return null;
  }
}

/** Expand a config path: a file → itself; a dir → its immediate children. */
function expand(p: string): SysFile[] {
  const base = statFile(p);
  if (!base) return [];
  if (!base.isDir) return [base];
  try {
    return fs
      .readdirSync(p)
      .slice(0, 40)
      .map((name) => statFile(path.join(p, name)))
      .filter((f): f is SysFile => !!f)
      .sort((a, b) => Number(a.isDir) - Number(b.isDir) || a.name.localeCompare(b.name));
  } catch {
    return [base];
  }
}

export function listSystemFiles(): SysGroup[] {
  const groups: SysGroup[] = [];

  // One group per agent — its configured config files/dirs that exist.
  for (const a of AGENTS) {
    const seen = new Set<string>();
    const files: SysFile[] = [];
    for (const cp of a.configPaths ?? []) {
      for (const f of expand(cp)) {
        if (!seen.has(f.path)) {
          seen.add(f.path);
          files.push(f);
        }
      }
    }
    if (files.length) {
      groups.push({ id: a.id, label: a.name, accent: a.accent, files });
    }
  }

  // Shared memory vault.
  const vaultFiles = expand(VAULT_DIR);
  if (vaultFiles.length) {
    groups.push({ id: "vault", label: "Memory Vault", accent: "#46e0d0", files: vaultFiles });
  }

  // The dashboard's own config.
  const mc = expand(MC_CONFIG_DIR);
  if (mc.length) {
    groups.push({ id: "mission-control", label: "Mission Control", accent: "#9d8cff", files: mc });
  }

  return groups;
}

const MAX_READ = 200_000;

export function readSystemFile(p: string): { ok: boolean; content?: string; error?: string } {
  const resolved = path.resolve(p);
  const allowed = ALLOWED_ROOTS.some((root) => {
    const r = path.resolve(root);
    return resolved === r || resolved.startsWith(r + path.sep);
  });
  // Also allow agent config roots that live under HOME dotdirs.
  const underHomeDot =
    resolved.startsWith(path.join(HOME, ".")) &&
    AGENTS.some((a) =>
      (a.configPaths ?? []).some((cp) => {
        const cpr = path.resolve(cp);
        return resolved === cpr || resolved.startsWith(cpr + path.sep);
      })
    );
  if (!allowed && !underHomeDot) {
    return { ok: false, error: "path not permitted" };
  }
  try {
    const st = fs.statSync(resolved);
    if (st.isDirectory()) return { ok: false, error: "is a directory" };
    if (st.size > MAX_READ) {
      return { ok: true, content: fs.readFileSync(resolved, "utf8").slice(0, MAX_READ) + "\n… (truncated)" };
    }
    return { ok: true, content: fs.readFileSync(resolved, "utf8") };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
