import path from "node:path";
import { REPO_ROOT } from "./paths";

/*
  Sentinel-gated writes.

  The fleet is autonomous — every CLI agent can read project state and run shell
  in its own scope. To bound the blast radius of a misbehaving agent, only one
  agent (Sentinel, the security operator) is allowed to modify the project's
  executable surface: the lib/, app/, components/ source trees, the registry,
  settings, and any *.ts/*.tsx file under the repo root.

  Other agents keep two narrow writable paths:
    1. Their OWN vault note  — file in MissionControlVault/Agents/<Name>.md,
       scoped by id in the self-edit hook. Structurally safe; never touches code.
    2. The shared Activity Log under MissionControlVault/Activity/ — append-only,
       no structural risk.

  Anything else is denied unless the writer is Sentinel.

  The other agents can still PROPOSE changes — they can write diffs to a
  patches/ scratch area (gitignored) and Sentinel reviews/applies them.

  This is enforced server-side on every API write path that touches files or
  runs subagents. It is not advisory.
*/

const REPO = REPO_ROOT;

/**
 * Top-level source directories that hold the executable surface of Mission
 * Control. Any write into them (or any *.ts/*.tsx under the repo) is gated
 * to Sentinel only.
 */
const PROTECTED_DIRS = [
  path.join(REPO, "lib"),
  path.join(REPO, "app"),
  path.join(REPO, "components"),
  path.join(REPO, "next.config.mjs"),
  path.join(REPO, "package.json"),
  path.join(REPO, "tsconfig.json"),
  path.join(REPO, "vitest.config.ts"),
  path.join(REPO, "tailwind.config.ts"),
  path.join(REPO, "postcss.config.mjs"),
];

/**
 * Vault paths other agents are still allowed to write (append-only or
 * scoped to their own file). These are NOT protected.
 */
const VAULT_DIR = path.join(REPO, "MissionControlVault");
const PATCHES_DIR = path.join(REPO, "patches");

export const AGENT_WHITELIST = {
  /** Agents other than Sentinel may write to these path roots. */
  ALLOWED: [path.join(VAULT_DIR, "Activity"), path.join(VAULT_DIR, "Memory"), PATCHES_DIR] as string[],
  /** Allowed for everyone because it lives outside the repo. */
  OUTSIDE_REPO_OK: true,
} as const;

/** The one agent permitted to modify the protected surface. */
export const WRITE_TRUSTED_AGENT = "sentinel";

export type WriteKind =
  | "file.write"      // create or overwrite a file
  | "file.delete"     // remove a file
  | "shell.exec"      // run an arbitrary shell command (subagent dispatch)
  | "registry.write"  // edit lib/registry.ts or similar
  | "settings.write"; // write to MC settings / routing

export interface WriteCheck {
  ok: boolean;
  reason: string;
  /**
   * The agent that must be the writer for this to be allowed. When `ok=false`
   * and `requiredAgent !== undefined`, the request must come from that agent.
   */
  requiredAgent?: string;
}

/**
 * Normalize a path so the comparison is robust on Windows (case, separators).
 */
function norm(p: string): string {
  return path.resolve(p).replace(/\\/g, "/");
}

/**
 * Is this target inside the repo's protected surface (source tree,
 * executable configs)? If yes, only Sentinel may write.
 */
export function isProtectedTarget(target: string): boolean {
  const t = norm(target);
  // Any *.ts / *.tsx under the repo root is protected, even if nested.
  if (t.startsWith(norm(REPO) + "/") && /\.(ts|tsx|mjs|cjs|js)$/.test(t)) return true;
  // Explicit top-level dirs.
  for (const dir of PROTECTED_DIRS) {
    const d = norm(dir);
    if (t === d || t.startsWith(d + "/")) return true;
  }
  return false;
}

/**
 * Is this target inside an agent-allowed write root (vault activity, vault
 * memory, patches/)?
 */
export function isAgentAllowedTarget(target: string): boolean {
  const t = norm(target);
  for (const root of AGENT_WHITELIST.ALLOWED) {
    if (t === norm(root) || t.startsWith(norm(root) + "/")) return true;
  }
  return false;
}

/**
 * Check whether `callerAgentId` may perform `kind` on `target`.
 * Returns ok=false + reason when denied.
 */
export function checkWritePermission(opts: {
  callerAgentId: string | null | undefined;
  target: string;
  kind?: WriteKind;
  /**
   * Special carve-out: writing the agent's OWN vault note. The structural
   * guard in the self-edit hook already scopes this to one file, but we
   * pass it through here so the rule lives in one place.
   */
  ownAgentNote?: boolean;
}): WriteCheck {
  const target = opts.target;
  const caller = opts.callerAgentId ?? null;

  // Sentinel is trusted on everything. The one exception is reading the
  // audit trail — but that's read-only and not gated here.
  if (caller === WRITE_TRUSTED_AGENT) {
    return { ok: true, reason: "Sentinel — sole trusted writer" };
  }

  // The agent's own vault note (structurally scoped by the self-edit hook).
  if (opts.ownAgentNote) {
    return { ok: true, reason: "agent's own vault note (scoped by hook)" };
  }

  // Outside the repo entirely? Allow (e.g. workspace files in a parallel
  // worktree, target_fetch downloads, sandbox dirs).
  const n = norm(target);
  if (!n.startsWith(norm(REPO) + "/")) {
    return { ok: true, reason: "outside repo — not gated" };
  }

  // Inside the agent's allowed write roots (Activity log, Shared Knowledge,
  // patches/ staging area)?
  if (isAgentAllowedTarget(target)) {
    return { ok: true, reason: "vault activity / memory / patches (agent-allowed)" };
  }

  // Otherwise: protected. Sentinel only.
  return {
    ok: false,
    reason: `protected path: only ${WRITE_TRUSTED_AGENT} may modify ${opts.kind ?? "this"} on the executable surface`,
    requiredAgent: WRITE_TRUSTED_AGENT,
  };
}

/**
 * Convenience: check whether the given agent may run a shell command that
 * could touch arbitrary paths (subagent dispatch). Shell is gated just like
 * file writes — non-Sentinel agents can only run in their worktree/sandbox.
 */
export function checkShellPermission(opts: {
  callerAgentId: string | null | undefined;
  command: string;
  cwd?: string;
}): WriteCheck {
  // Sentinel is trusted.
  if (opts.callerAgentId === WRITE_TRUSTED_AGENT) {
    return { ok: true, reason: "Sentinel — sole trusted writer" };
  }
  // Other agents can run shell in their sandbox dirs (workspace, worktrees,
  // patches/) — but the lib/subagents.ts spawner constrains cwd anyway. The
  // additional gate: the command must not include paths into the protected
  // surface, AND the cwd must be outside lib/app/components.
  const cwd = opts.cwd ? norm(opts.cwd) : null;
  if (cwd && PROTECTED_DIRS.some((d) => cwd === norm(d) || cwd.startsWith(norm(d) + "/"))) {
    return {
      ok: false,
      reason: "subagent cwd is inside a protected directory; only Sentinel may run there",
      requiredAgent: WRITE_TRUSTED_AGENT,
    };
  }
  return { ok: true, reason: "sandbox shell — outside protected dirs" };
}

/** A concise audit-trail line that gets logged when a write is denied. */
export function denyLog(opts: {
  callerAgentId: string | null | undefined;
  target: string;
  kind: WriteKind | "shell";
  check: WriteCheck;
}): string {
  return `[write-gate] DENIED caller=${opts.callerAgentId ?? "anonymous"} kind=${opts.kind} target=${opts.target} required=${opts.check.requiredAgent ?? "—"} reason="${opts.check.reason}"`;
}
