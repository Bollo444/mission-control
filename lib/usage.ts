import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";
import { limitFor, type ProviderLimit } from "./limits";

/*
  Per-provider usage ledger for the Fleet Gateway — rolling RPM/RPD/TPM/TPD
  counters plus success/latency aggregates, persisted to
  ~/.mission-control/usage.json. Powers budget pre-checks and the Settings gauges.
*/

export interface ProviderUsage {
  day: string; // UTC YYYY-MM-DD
  reqDay: number;
  tokDay: number;
  minute: number; // epoch minute
  reqMin: number;
  tokMin: number;
  requests: number; // since last clear
  successes: number;
  failures: number;
  latencyTotalMs: number;
  latencySamples: number;
  lastServedAt: string | null;
}

type Ledger = Record<string, ProviderUsage>;

const FILE = path.join(MC_CONFIG_DIR, "usage.json");

const today = () => new Date().toISOString().slice(0, 10);
const nowMinute = () => Math.floor(Date.now() / 60000);

function blank(): ProviderUsage {
  return {
    day: today(),
    reqDay: 0,
    tokDay: 0,
    minute: nowMinute(),
    reqMin: 0,
    tokMin: 0,
    requests: 0,
    successes: 0,
    failures: 0,
    latencyTotalMs: 0,
    latencySamples: 0,
    lastServedAt: null,
  };
}

function readLedger(): Ledger {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Ledger;
  } catch {
    return {};
  }
}
function writeLedger(l: Ledger) {
  try {
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(l, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

/** Roll the day/minute windows forward in place. */
function roll(u: ProviderUsage) {
  const d = today();
  const m = nowMinute();
  if (u.day !== d) {
    u.day = d;
    u.reqDay = 0;
    u.tokDay = 0;
  }
  if (u.minute !== m) {
    u.minute = m;
    u.reqMin = 0;
    u.tokMin = 0;
  }
}

function getRolled(l: Ledger, p: string): ProviderUsage {
  if (!l[p]) l[p] = blank();
  roll(l[p]);
  return l[p];
}

export function recordAttempt(provider: string, opts: { ok: boolean; latencyMs?: number }) {
  const l = readLedger();
  const u = getRolled(l, provider);
  u.requests++;
  if (opts.ok) {
    u.successes++;
    u.reqDay++;
    u.reqMin++;
    u.lastServedAt = new Date().toISOString();
  } else {
    u.failures++;
  }
  if (typeof opts.latencyMs === "number") {
    u.latencyTotalMs += opts.latencyMs;
    u.latencySamples++;
  }
  writeLedger(l);
}

export function recordTokens(provider: string, tokens: number) {
  if (!tokens || tokens < 0) return;
  const l = readLedger();
  const u = getRolled(l, provider);
  u.tokDay += tokens;
  u.tokMin += tokens;
  writeLedger(l);
}

/** True if a known limit is already met (advisory pre-check before routing). */
export function overBudget(provider: string): boolean {
  const lim = limitFor(provider);
  if (!lim.rpm && !lim.rpd && !lim.tpm && !lim.tpd) return false;
  const l = readLedger();
  const u = getRolled(l, provider);
  return Boolean(
    (lim.rpm && u.reqMin >= lim.rpm) ||
      (lim.rpd && u.reqDay >= lim.rpd) ||
      (lim.tpm && u.tokMin >= lim.tpm) ||
      (lim.tpd && u.tokDay >= lim.tpd)
  );
}

export interface UsageRow {
  provider: string;
  limit: ProviderLimit;
  reqDay: number;
  reqMin: number;
  tokDay: number;
  requests: number;
  successes: number;
  failures: number;
  successRate: number | null; // 0..1
  avgLatencyMs: number | null;
  lastServedAt: string | null;
  over: boolean;
}

export function usageReport(providers: string[]): UsageRow[] {
  const l = readLedger();
  return providers.map((p) => {
    const u = l[p] ?? blank();
    if (l[p]) roll(u);
    const lim = limitFor(p);
    return {
      provider: p,
      limit: lim,
      reqDay: u.reqDay,
      reqMin: u.reqMin,
      tokDay: u.tokDay,
      requests: u.requests,
      successes: u.successes,
      failures: u.failures,
      successRate: u.requests ? u.successes / u.requests : null,
      avgLatencyMs: u.latencySamples ? Math.round(u.latencyTotalMs / u.latencySamples) : null,
      lastServedAt: u.lastServedAt,
      over:
        Boolean(lim.rpm && u.reqMin >= lim.rpm) ||
        Boolean(lim.rpd && u.reqDay >= lim.rpd) ||
        Boolean(lim.tpm && u.tokMin >= lim.tpm) ||
        Boolean(lim.tpd && u.tokDay >= lim.tpd),
    };
  });
}

export function clearUsage() {
  writeLedger({});
}
