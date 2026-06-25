import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as pty from "@lydell/node-pty";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { home } from "./paths";

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

/** Resolve the binary for an allow-listed kind. Returns null if not found. */
function resolveCommand(kind: string): { cmd: string; args: string[]; cwd: string } | null {
  if (kind === "shell") {
    const cmd = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
    return { cmd, args: [], cwd: home() };
  }
  // Any registered agent's native CLI: prefer an existing absolute binPath,
  // else fall back to its PATH command name. Spawns the agent's real harness so
  // its own banner/branding renders in the embedded terminal. Allow-listed by
  // registry membership — the client still can't request an arbitrary command.
  const a = getAgent(kind);
  if (!a) return null;
  // resolveBinary() checks binPaths AND resolves the command on PATH with the
  // right Windows extension (PATHEXT) — so opencode's npm shim resolves to
  // opencode.cmd, not the bare (unspawnable) name.
  const resolved = resolveBinary(a) ?? a.launch?.cmd ?? a.binPaths?.find(Boolean);
  if (!resolved) return null;
  const launchArgs = a.launch?.args ?? [];
  // Windows .cmd/.bat shims (kilo, openclaw, pi, sentinel's launcher) can't be
  // exec'd directly by a PTY — it throws EINVAL. Run them through cmd.exe so the
  // agent's own TUI still renders in the embedded terminal.
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(resolved)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    return { cmd: comspec, args: ["/c", resolved, ...launchArgs], cwd: home() };
  }
  return { cmd: resolved, args: launchArgs, cwd: home() };
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
  const existing = sessions.get(id);
  if (existing && !existing.exited) return { ok: true };
  if (existing) sessions.delete(id); // exited — replace it

  const resolved = resolveCommand(kind);
  if (!resolved) return { ok: false, error: `unknown session kind: ${kind}` };

  // Refresh the Hermes update-check cache before spawning so banner.py's
  // prefetch_update_check() hits the cached path and skips the git subprocess
  // that would flash a console window on Windows. See refreshHermesUpdateCache.
  if (kind === "hermes") refreshHermesUpdateCache();

  let proc: pty.IPty;
  try {
    proc = pty.spawn(resolved.cmd, resolved.args, {
      name: "xterm-256color",
      cols: size.cols || 80,
      rows: size.rows || 24,
      cwd: resolved.cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        // Best-effort env-flag suppression for Hermes startup noise (hermes kind only).
        // The definitive flash fix is refreshHermesUpdateCache() above, which keeps
        // banner.py's prefetch_update_check() on the cache hit path so it never reaches
        // the git subprocess calls. These vars are belt-and-suspenders for any other
        // startup subprocess that may check them:
        //   HERMES_QUIET — confirmed used in hermes (cli.py, gateway/run.py) for noise suppression
        //   NO_UPDATE_NOTIFIER — common convention; not confirmed in hermes source but harmless
        ...(kind === "hermes" ? {
          HERMES_QUIET: "1",
          NO_UPDATE_NOTIFIER: "1",
        } : {}),
      } as Record<string, string>,
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

  proc.onData((chunk) => {
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
  if (!s || s.exited) return false;
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
