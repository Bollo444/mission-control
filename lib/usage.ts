import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";
import { limitFor, type ProviderLimit } from "./limits";
import { getLiveLimit } from "./livelimits";

/*
  Per-provider usage ledger for the Fleet Gateway — rolling RPM/RPD/TPM/TPD
  counters plus success/latency aggregates, persisted to
  ~/.mission-control/usage.json. Powers budget pre-checks and the Settings gauges.
*/

export interface DayStat {
  req: number;
  ok: number;
  fail: number;
  tok: number;
  latSum: number;
  latN: number;
}

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
  /** Per-day history (last ~31 days) for time-windowed analytics. */
  days: Record<string, DayStat>;
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
    days: {},
  };
}

function dayStat(u: ProviderUsage): DayStat {
  if (!u.days) u.days = {};
  const d = today();
  if (!u.days[d]) u.days[d] = { req: 0, ok: 0, fail: 0, tok: 0, latSum: 0, latN: 0 };
  // prune to the last 31 days
  const keys = Object.keys(u.days).sort();
  while (keys.length > 31) delete u.days[keys.shift()!];
  return u.days[d];
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
  const ds = dayStat(u);
  u.requests++;
  ds.req++;
  if (opts.ok) {
    u.successes++;
    u.reqDay++;
    u.reqMin++;
    u.lastServedAt = new Date().toISOString();
    ds.ok++;
  } else {
    u.failures++;
    ds.fail++;
  }
  if (typeof opts.latencyMs === "number") {
    u.latencyTotalMs += opts.latencyMs;
    u.latencySamples++;
    ds.latSum += opts.latencyMs;
    ds.latN++;
  }
  writeLedger(l);
}

export function recordTokens(provider: string, tokens: number) {
  if (!tokens || tokens < 0) return;
  const l = readLedger();
  const u = getRolled(l, provider);
  u.tokDay += tokens;
  u.tokMin += tokens;
  dayStat(u).tok += tokens;
  writeLedger(l);
}

/** True if a known limit is already met (advisory pre-check before routing). */
export function overBudget(provider: string): boolean {
  const lim = limitFor(provider);
  const live = getLiveLimit(provider);
  const effRpd = live?.rpd ?? lim.rpd;
  if (!lim.rpm && !effRpd && !lim.tpm && !lim.tpd && live?.rpdRemaining == null) return false;
  const l = readLedger();
  const u = getRolled(l, provider);
  return Boolean(
    (lim.rpm && u.reqMin >= lim.rpm) ||
      (effRpd && u.reqDay >= effRpd) ||
      (live?.rpdRemaining != null && live.rpdRemaining <= 0) ||
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
  /** Effective requests/day limit — provider-reported (live) if known, else the static estimate. */
  effRpd: number | null;
  /** Requests remaining today — provider-reported when available, else effRpd − reqDay. */
  rpdRemaining: number | null;
  /** True when the limit came from the provider (headers / OpenRouter credits), not an estimate. */
  live: boolean;
  over: boolean;
}

export function usageReport(providers: string[]): UsageRow[] {
  const l = readLedger();
  return providers.map((p) => {
    const u = l[p] ?? blank();
    if (l[p]) roll(u);
    const lim = limitFor(p);
    const live = getLiveLimit(p);
    const effRpd = live?.rpd ?? lim.rpd ?? null;
    const rpdRemaining =
      live?.rpdRemaining != null ? live.rpdRemaining : effRpd != null ? Math.max(0, effRpd - u.reqDay) : null;
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
      effRpd,
      rpdRemaining,
      live: live?.rpd != null,
      over:
        Boolean(effRpd && u.reqDay >= effRpd) ||
        Boolean(rpdRemaining != null && rpdRemaining <= 0) ||
        Boolean(lim.rpm && u.reqMin >= lim.rpm) ||
        Boolean(lim.tpm && u.tokMin >= lim.tpm) ||
        Boolean(lim.tpd && u.tokDay >= lim.tpd),
    };
  });
}

export function clearUsage() {
  writeLedger({});
}

export interface AnalyticsRow {
  provider: string;
  requests: number;
  successes: number;
  failures: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  tokens: number;
}

/** Aggregate per-provider stats over the last `windowDays` (0 = today only). */
export function analyticsReport(windowDays: number): AnalyticsRow[] {
  const l = readLedger();
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const rows: AnalyticsRow[] = [];
  for (const [provider, u] of Object.entries(l)) {
    let req = 0,
      ok = 0,
      fail = 0,
      tok = 0,
      latSum = 0,
      latN = 0;
    for (const [date, ds] of Object.entries(u.days ?? {})) {
      if (date < cutoff) continue;
      req += ds.req;
      ok += ds.ok;
      fail += ds.fail;
      tok += ds.tok;
      latSum += ds.latSum;
      latN += ds.latN;
    }
    if (req > 0) {
      rows.push({
        provider,
        requests: req,
        successes: ok,
        failures: fail,
        successRate: req ? ok / req : null,
        avgLatencyMs: latN ? Math.round(latSum / latN) : null,
        tokens: tok,
      });
    }
  }
  return rows.sort((a, b) => b.requests - a.requests);
}
