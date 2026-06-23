import * as pty from "@lydell/node-pty";
import { getAgent } from "./registry";
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

/** Resolve the binary for an allow-listed kind. Returns null if not found. */
function resolveCommand(kind: string): { cmd: string; args: string[]; cwd: string } | null {
  if (kind === "hermes") {
    const a = getAgent("hermes");
    const cmd =
      a?.binPaths?.find(Boolean) ?? home(".local", "bin", "hermes.exe");
    return { cmd, args: [], cwd: home() };
  }
  if (kind === "shell") {
    const cmd = process.platform === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
    return { cmd, args: [], cwd: home() };
  }
  return null;
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

  let proc: pty.IPty;
  try {
    proc = pty.spawn(resolved.cmd, resolved.args, {
      name: "xterm-256color",
      cols: size.cols || 80,
      rows: size.rows || 24,
      cwd: resolved.cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
    });
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
