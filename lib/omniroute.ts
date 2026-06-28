import { logEvent } from "./logbook";

/**
 * Fleet Gateway (Primary) — OmniRoute client and failover policy.
 * OmniRoute is a local AI gateway/router that runs as an external service on :20128/v1.
 *
 * Circuit Breaker: 3 failures, 30s cooldown.
 */

const OMNIROUTE_BASE = process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1";
const PROBE_TIMEOUT_MS = 2000;
const PROBE_CACHE_TTL_MS = 5000;

const CB_THRESHOLD = 3;
const CB_COOLDOWN_MS = 30000;

let failureCount = 0;
let cbCooldownUntil = 0;

interface ProbeResult {
  up: boolean;
  latencyMs: number;
  detail?: string;
  cachedAt: number;
}

let lastProbe: ProbeResult | null = null;

/**
 * Report liveness of OmniRoute with a short cache and timeout.
 * Never throws.
 */
export async function probe(): Promise<ProbeResult> {
  const now = Date.now();

  // Return cached probe if within TTL
  if (lastProbe && (now - lastProbe.cachedAt) < PROBE_CACHE_TTL_MS) {
    return lastProbe;
  }

  // Circuit breaker check
  if (now < cbCooldownUntil) {
    return { up: false, latencyMs: 0, detail: "circuit breaker active", cachedAt: now };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const t0 = now;

  try {
    const res = await fetch(`${OMNIROUTE_BASE}/models`, { signal: ctrl.signal });
    clearTimeout(timer);

    const up = res.ok;
    const latencyMs = Date.now() - t0;

    if (up) {
      failureCount = 0;
    } else {
      recordFailure();
    }

    lastProbe = { up, latencyMs, detail: up ? undefined : `HTTP ${res.status}`, cachedAt: now };
    return lastProbe;
  } catch (e) {
    clearTimeout(timer);
    recordFailure();
    const detail = e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable";
    lastProbe = { up: false, latencyMs: Date.now() - t0, detail, cachedAt: now };
    return lastProbe;
  }
}

function recordFailure() {
  failureCount++;
  if (failureCount >= CB_THRESHOLD) {
    cbCooldownUntil = Date.now() + CB_COOLDOWN_MS;
    logEvent({
      source: "gateway",
      level: "warn",
      event: "circuit breaker tripped",
      detail: `OmniRoute failed ${failureCount} times. Cooldown for ${CB_COOLDOWN_MS/1000}s.`
    });
  }
}

/**
 * Intercept chat/completions and forward to OmniRoute.
 * Returns null if OmniRoute is unreachable or errors with 5xx (failover trigger).
 */
export async function forwardChat(body: Record<string, unknown>, headers: Headers): Promise<Response | null> {
  const status = await probe();
  if (!status.up) return null;

  const url = `${OMNIROUTE_BASE}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000); // reuse existing 60s timeout

  // Prepare headers for forwarding (Auth stays at MC edge)
  const forwardHeaders = new Headers();
  forwardHeaders.set("Content-Type", "application/json");
  // Don't forward the MC gateway token to OmniRoute;
  // OmniRoute uses its own provider keys from its SQLite DB.

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    clearTimeout(timer);

    // Failover triggers: 5xx (OmniRoute crash/issue).
    // Do NOT failover on 4xx (caller's bug) or 429 (OmniRoute should handle internally).
    if (res.status >= 500) {
      recordFailure();
      logEvent({ source: "gateway", level: "warn", event: "omniroute 5xx", detail: `HTTP ${res.status} — failing over to backup` });
      return null;
    }

    return res;
  } catch (e) {
    clearTimeout(timer);
    recordFailure();
    logEvent({ source: "gateway", level: "warn", event: "omniroute error", detail: "Unreachable or timeout — failing over to backup" });
    return null;
  }
}

/** Proxy OmniRoute's /models for the catalog view. */
export async function omnirouteModels(): Promise<{ id: string; owned_by: string }[]> {
  try {
    const res = await fetch(`${OMNIROUTE_BASE}/models`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.data) ? data.data.map((m: any) => ({ id: m.id, owned_by: m.owned_by })) : [];
  } catch {
    return [];
  }
}

export { OMNIROUTE_BASE };
