import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";
import type { LogEvent, LogLevel } from "./types";

/*
  Universal Mission Control logbook. Every meaningful thing the app does is
  appended here, in order, as one JSON object per line (JSONL) at
  ~/.mission-control/events.log — the single source of truth behind the Logs tab.

  Deliberately dependency-free and crash-proof: logging must never break a request.
  Secrets are never logged (callers pass names/counts, never key values).
*/

export type { LogEvent, LogLevel };

const LOG_FILE = path.join(MC_CONFIG_DIR, "events.log");
const MAX_LINES = 4000; // keep the file bounded
const TRIM_EVERY = 250; // amortize trimming across appends

let sinceTrim = 0;

function trimIfNeeded() {
  if (++sinceTrim < TRIM_EVERY) return;
  sinceTrim = 0;
  try {
    const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_LINES) {
      fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LINES).join("\n") + "\n", "utf8");
    }
  } catch {
    /* ignore */
  }
}

/** Append one event. Never throws. */
export function logEvent(e: Omit<LogEvent, "ts">): void {
  try {
    const full: LogEvent = { ts: new Date().toISOString(), ...e };
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(full) + "\n", "utf8");
    trimIfNeeded();
  } catch {
    /* logging must never break the caller */
  }
}

export interface ReadOpts {
  limit?: number;
  source?: string;
  level?: LogLevel;
  /** Only events strictly newer than this ISO timestamp (for incremental polling). */
  since?: string;
  /** Case-insensitive substring match across event/detail/source. */
  q?: string;
}

/** Newest-first slice of the log, with optional filters. */
export function readEvents(opts: ReadOpts = {}): LogEvent[] {
  const limit = opts.limit ?? 300;
  let raw: string;
  try {
    raw = fs.readFileSync(LOG_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n");
  const q = opts.q?.toLowerCase();
  const out: LogEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i];
    if (!line) continue;
    let e: LogEvent;
    try {
      e = JSON.parse(line) as LogEvent;
    } catch {
      continue;
    }
    if (opts.source && e.source !== opts.source) continue;
    if (opts.level && e.level !== opts.level) continue;
    if (opts.since && e.ts <= opts.since) continue;
    if (q && !`${e.source} ${e.event} ${e.detail ?? ""}`.toLowerCase().includes(q)) continue;
    out.push(e);
  }
  return out;
}

/** Distinct sources currently present (for the filter dropdown). */
export function logSources(): string[] {
  const seen = new Set<string>();
  for (const e of readEvents({ limit: 1000 })) seen.add(e.source);
  return [...seen].sort();
}

export function clearEvents(): void {
  try {
    fs.writeFileSync(LOG_FILE, "", "utf8");
  } catch {
    /* ignore */
  }
}
