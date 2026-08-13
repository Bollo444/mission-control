import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as pty from "@lydell/node-pty";
import { getAgent } from "./registry";
import { openSwarmLaunch } from "./openswarm";
import { prepareAgentBoot, answersForAgent, stripAnsi } from "./agent-boot";
import { resolveBinary } from "./detect";
import { home, REPO_WORKSPACE_DIR, WORKSPACE_DIR } from "./paths";

/**
 * Working directory for agent CLI sessions. Coding agents shouldn't open in the
 * home root (they scan/index the cwd, and e.g. vibe warns "running in home is
 * not recommended"), so agents get a dedicated workspace dir, created on demand.
 * Falls back to home only if the dir can't be created.
 */
function agentCwd(): string {
  try {
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    return WORKSPACE_DIR;
  } catch {
    return home();
  }
}

/** Working directory for the Antigravity CLI shell — the repo workspace.
 *  Created on demand so the terminal is ready for git operations immediately. */
function repoWorkspaceCwd(): string {
  try {
    fs.mkdirSync(REPO_WORKSPACE_DIR, { recursive: true });
    return REPO_WORKSPACE_DIR;
  } catch {
    return agentCwd();
  }
}

/* ------------------------------------------------------------------ *
 * Server-side PTY session manager. Each named session owns one real    *
 * pseudo-terminal (ConPTY on Windows) running an allow-listed agent    *
 * binary — e.g. the native Hermes TUI. Sessions live in the Node       *
 * process, so switching tabs or reconnecting the SSE stream resumes    *
 * the SAME terminal: we keep a scrollback buffer and replay it on      *
 * every (re)subscribe. The client can only ask for a known kind, never *
 * an arbitrary command.                                                *
 * ------------------------------------------------------------------ */

type Subscriber = (chunk: string) => void;

interface Session {
  proc: pty.IPty;
  /** Rolling scrollback so a reconnecting client sees history, not a blank. */
  buffer: string;
  subscribers: Set<Subscriber>;
  exited: boolean;
  exitCode: number | null;
  cols: number;
  rows: number;
}

const sessions = new Map<string, Session>();
const MAX_BUFFER = 200_000; // ~200 KB of scrollback per session

/**
 * Refresh the Hermes update-check cache so that hermes_cli/banner.py's
 * prefetch_update_check() always hits the cache path on startup and never
 * spawns a git subprocess (git fetch / git rev-list / git ls-remote).
 *
 * banner.py checks three conditions for a cache hit (banner.py ~line 256-261):
 *   1. now - cached["ts"] < 21600  (6-hour TTL, _UPDATE_CHECK_CACHE_SECONDS)
 *   2. cached["rev"] == HERMES_REVISION env var (null when not set)
 *   3. cached["ver"] == hermes_cli.__version__
 *
 * Strategy: read the existing cache (which has the correct "rev" and "ver"
 * for this install), reset "ts" to now so it stays fresh for another 6 hours,
 * then write it back. If the file doesn't exist yet, skip — hermes will write
 * a correct one after its first git/PyPI check, and we'll refresh it from
 * the next launch onward. Wrapped in try/catch: a write failure must never
 * block the PTY spawn.
 */
function refreshHermesUpdateCache(): void {
  try {
    const hermesHome =
      process.env.HERMES_HOME ||
      path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
        "hermes"
      );
    const cacheFile = path.join(hermesHome, ".update_check");

    // Only refresh an existing cache so we never write a wrong "ver" value.
    if (!fs.existsSync(cacheFile)) return;

    const raw = fs.readFileSync(cacheFile, "utf8");
    const cached = JSON.parse(raw) as Record<string, unknown>;

    // Stamp "ts" to now (seconds, matching Python's time.time()).
    cached["ts"] = Date.now() / 1000;

    fs.writeFileSync(cacheFile, JSON.stringify(cached), "utf8");
  } catch {
    // Never let a cache I/O failure prevent the PTY from spawning.
  }
}

/**
 * Session kinds that open a shell with an agent's CLI on PATH instead of the
 * agent's native TUI (which either doesn't exist or can't run in ConPTY).
 * Maps the session kind to the registry agent id whose bin dir is added to PATH.
 */
const SHELL_MODE: Record<string, string> = {
  "zcode-cli": "zcode",
  cline: "cline",
};

/**
 * Map a session kind to the registry agent whose boot prep applies (config
 * pre-seeding + onboarding-prompt answering).
 */
function bootAgentForKind(kind: string): string | null {
  if (kind === "sentinel") return "sentinel";
  if (kind === "zcode-cli") return "zcode";
  const shellAgent = SHELL_MODE[kind];
  if (shellAgent) return shellAgent;
  return getAgent(kind) ? kind : null;
}

/** Resolve the binary for an allow-listed native agent kind. */
function resolveCommand(
  kind: string
): { cmd: string; args: string[]; cwd: string; env?: Record<string, string> } | null {
  // Never expose a general shell through the browser — that was the RCE vector.
  // Agent dispatch (fixed registry kinds, including the shell-mode agents below)
  // is gated behind the admin boundary in middleware.
  if (kind === "shell") return null;

  // Shell-mode kinds: run a REAL shell with the agent's CLI prepended to PATH
  // instead of its native TUI. Used when the TUI isn't viable in the embedded
  // ConPTY:
  //   • zcode-cli — ZCode is a desktop Electron IDE; auto-launch `zcode`
  //     so the user sees the editor CLI immediately.
  //   • cline — Cline's TUI (cline -i) needs bun:ffi which the npm build can't
  //     load in ConPTY, so a shell is exposed here for ad-hoc CLI/inspection.
  //     The headless dispatch (`cline "..."`) is wired for flows/automation
  //     and properly routes through the Fleet Gateway (openai-compatible).
  const shellModeAgent = SHELL_MODE[kind];
  if (shellModeAgent) {
    const cmd = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
    const a = getAgent(shellModeAgent);
    const bin = a ? resolveBinary(a) : null;
    const env = bin
      ? { PATH: path.dirname(bin) + path.delimiter + (process.env.PATH || process.env.Path || "") }
      : undefined;
    // IDE shells open in the repo workspace so git operations stay isolated
    // from the mission-control project directory.
    const cwd = kind === "zcode-cli" ? repoWorkspaceCwd() : agentCwd();

    // Auto-launch the agent's CLI on startup.
    let args: string[] = [];
    if (process.platform === "win32") {
      if (kind === "zcode-cli") {
        args = ["-NoExit", "-Command", "zcode; Write-Host '`n[zcode exited — back in shell]' -ForegroundColor Gray"];
      }
      // cline: no auto-launch — the TUI (cline -i) needs bun:ffi which the
      // npm build can't load in ConPTY. The shell is for ad-hoc CLI/inspection.
    } else {
      // Linux/macOS: similar but with bash
      if (kind === "zcode-cli") {
        args = ["-c", "zcode; exec bash"];
      }
    }
    return { cmd, args, cwd, env };
  }

  // Sentinel runs the OpenSwarm TUI — the real Agent Swarm harness the
  // workspace was forked from (the opencode/Claude-Code-style terminal UI) —
  // not the bare text-prompt CLI (run-sentinel.cmd). Resolves the stable TUI
  // binary and spawns it through the agentswarm-cli shim with the product env.
  if (kind === "sentinel") {
    const launch = openSwarmLaunch();
    if (launch) return launch;
    // No TUI binary installed — fall through to the text-prompt CLI.
  }

  // Any registered agent's native CLI: prefer an existing absolute binPath,
  // else fall back to its PATH command name. Spawns the agent's real harness so
  // its own banner/branding renders in the embedded terminal. Allow-listed by
  // registry membership — the client still can't request an arbitrary command.
  const a = getAgent(kind);
  if (!a) return null;
  // resolveBinary() checks binPaths AND resolves the command on PATH with the
  // right Windows extension (PATHEXT) — so the npm global shims resolve to
  // their .cmd, not the bare (unspawnable) name.
  const resolved = resolveBinary(a) ?? a.launch?.cmd ?? a.binPaths?.find(Boolean);
  if (!resolved) return null;
  const launchArgs = a.launch?.args ?? [];
  // Windows .cmd/.bat shims (openclaw, pi, sentinel's launcher) can't be
  // exec'd directly by a PTY — it throws EINVAL. Run them through cmd.exe so the
  // agent's own TUI still renders in the embedded terminal.
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    return { cmd: comspec, args: ["/c", resolved, ...launchArgs], cwd: agentCwd() };
  }
  return { cmd: resolved, args: launchArgs, cwd: agentCwd() };
}

export interface SessionInfo {
  exists: boolean;
  exited: boolean;
  exitCode: number | null;
}

export function sessionInfo(id: string): SessionInfo {
  const s = sessions.get(id);
  return {
    exists: !!s,
    exited: s?.exited ?? false,
    exitCode: s?.exitCode ?? null,
  };
}

/** Get an existing live session or spawn a fresh PTY for the given kind. */
export function getOrCreateSession(
  id: string,
  kind: string,
  size: { cols: number; rows: number }
): { ok: boolean; error?: string } {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) return { ok: false, error: "invalid session id" };
  const existing = sessions.get(id);
  if (existing && !existing.exited) return { ok: true };
  if (existing) sessions.delete(id); // exited — replace it

  const resolved = resolveCommand(kind);
  if (!resolved) return { ok: false, error: `unknown session kind: ${kind}` };

  // Boot-to-prompt prep: run the agent's config pre-seeding (claude trust,
  // vibe update checks) so the CLI opens at a prompt, not onboarding.
  const bootAgent = bootAgentForKind(kind);
  if (bootAgent) prepareAgentBoot(bootAgent);

  // Refresh the Hermes update-check cache before spawning so banner.py's
  // prefetch_update_check() hits the cached path and skips the git subprocess
  // that would flash a console window on Windows. See refreshHermesUpdateCache.
  if (kind === "hermes") refreshHermesUpdateCache();

  // Base env, then apply any per-kind overrides (e.g. antigravity-cli's PATH).
  // Overrides win case-insensitively so a "PATH" override replaces Windows' "Path".
  const spawnEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    TERM: "xterm-256color",
    ...(kind === "hermes" ? { HERMES_QUIET: "1", NO_UPDATE_NOTIFIER: "1" } : {}),
  };
  if (resolved.env) {
    for (const [k, v] of Object.entries(resolved.env)) {
      for (const ex of Object.keys(spawnEnv)) {
        if (ex.toLowerCase() === k.toLowerCase()) delete spawnEnv[ex];
      }
      spawnEnv[k] = v;
    }
  }

  let proc: pty.IPty;
  try {
    proc = pty.spawn(resolved.cmd, resolved.args, {
      name: "xterm-256color",
      cols: size.cols || 80,
      rows: size.rows || 24,
      cwd: resolved.cwd,
      // spawnEnv (above) carries TERM, the per-kind PATH override, and the
      // hermes noise-suppression flags (HERMES_QUIET / NO_UPDATE_NOTIFIER —
      // belt-and-suspenders behind refreshHermesUpdateCache()).
      env: spawnEnv,
      // ConPTY is windowless — no console window flashes on spawn. windowsHide
      // isn't in node-pty's option type, so cast to pass it through.
      // Note: useConpty is deprecated/ignored in @lydell/node-pty (see node-pty.d.ts);
      // ConPTY is now always used on supported Windows builds, so this is a no-op
      // but harmless to keep for documentation clarity.
      useConpty: true,
      windowsHide: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const session: Session = {
    proc,
    buffer: "",
    subscribers: new Set(),
    exited: false,
    exitCode: null,
    cols: size.cols || 80,
    rows: size.rows || 24,
  };
  sessions.set(id, session);

  // Boot-answerer: watch the stream for the agent's known onboarding prompts
  // (jcode Alacritty, codex update, claude trust, OpenSwarm first-run) and
  // answer each once so the CLI lands at a ready prompt.
  const bootAnswers = bootAgent ? answersForAgent(bootAgent) : [];
  const answeredPrompts = new Set<string>();
  let bootBuf = "";

  proc.onData((chunk) => {
    if (bootAnswers.length) {
      bootBuf += chunk;
      if (bootBuf.length > 8192) bootBuf = bootBuf.slice(-8192);
      const text = stripAnsi(bootBuf);
      for (const a of bootAnswers) {
        if (!answeredPrompts.has(a.id) && a.test.test(text)) {
          answeredPrompts.add(a.id);
          try {
            proc.write(a.send);
          } catch {
            /* session already gone */
          }
        }
      }
    }
    session.buffer += chunk;
    if (session.buffer.length > MAX_BUFFER) {
      session.buffer = session.buffer.slice(session.buffer.length - MAX_BUFFER);
    }
    for (const sub of session.subscribers) {
      try {
        sub(chunk);
      } catch {
        /* a dead subscriber shouldn't break the others */
      }
    }
  });

  proc.onExit(({ exitCode }) => {
    session.exited = true;
    session.exitCode = exitCode;
    const note = `\r\n\x1b[2m— session ended (code ${exitCode}) —\x1b[0m\r\n`;
    session.buffer += note;
    for (const sub of session.subscribers) {
      try {
        sub(note);
      } catch {
        /* ignore */
      }
    }
  });

  return { ok: true };
}

/** Subscribe to live output. Immediately replays scrollback, then streams. */
export function subscribe(id: string, cb: Subscriber): (() => void) | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.buffer) cb(s.buffer); // replay history so reconnects resume in place
  s.subscribers.add(cb);
  return () => {
    s.subscribers.delete(cb);
  };
}

export function writeToSession(id: string, data: string): boolean {
  const s = sessions.get(id);
  if (!s || s.exited || data.length > 64 * 1024) return false;
  s.proc.write(data);
  return true;
}

export function resizeSession(id: string, cols: number, rows: number): boolean {
  const s = sessions.get(id);
  if (!s || s.exited) return false;
  if (cols > 0 && rows > 0) {
    s.cols = cols;
    s.rows = rows;
    try {
      s.proc.resize(cols, rows);
    } catch {
      return false;
    }
  }
  return true;
}

export function killSession(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  try {
    s.proc.kill();
  } catch {
    /* already gone */
  }
  sessions.delete(id);
  return true;
}
