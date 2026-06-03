import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";

/*
  Live per-provider rate limits, captured from real responses so the panel shows
  truth instead of a static estimate:
    • Header-based — x-ratelimit-* on a provider's chat response (e.g. Groq), read
      by the gateway as traffic flows.
    • OpenRouter — derived from /credits during the health sweep: a lifetime
      purchase of >= 10 credits unlocks 1,000 free req/day (else 50).
  Persisted to ~/.mission-control/livelimits.json. Absent => fall back to the
  static estimate in limits.ts.
*/

export interface LiveLimit {
  rpd?: number; // request/day limit (provider-reported)
  rpdRemaining?: number; // requests remaining (provider-reported, when available)
  tpd?: number; // token limit (provider-reported)
  source: string; // "headers" | "openrouter-credits"
  model?: string;
  capturedAt: string;
}

type Store = Record<string, LiveLimit>;

const FILE = path.join(MC_CONFIG_DIR, "livelimits.json");

function read(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}
function write(s: Store) {
  try {
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(s, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

export function getLiveLimit(provider: string): LiveLimit | undefined {
  return read()[provider];
}
export function readLiveLimits(): Store {
  return read();
}

function num(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Capture x-ratelimit-* headers from a provider response (no-op if absent). */
export function recordHeaders(provider: string, headers: Headers, model?: string) {
  const rpd = num(headers.get("x-ratelimit-limit-requests"));
  const rem = num(headers.get("x-ratelimit-remaining-requests"));
  const tpd = num(headers.get("x-ratelimit-limit-tokens"));
  if (rpd === undefined && rem === undefined) return; // nothing useful to store
  const s = read();
  s[provider] = {
    ...(s[provider]?.source === "openrouter-credits" ? {} : s[provider]),
    rpd,
    rpdRemaining: rem,
    tpd,
    source: "headers",
    model,
    capturedAt: new Date().toISOString(),
  };
  write(s);
}

/** Refresh OpenRouter's free-tier daily limit from lifetime credits purchased. */
export async function refreshOpenRouterLimit(keys: Record<string, string>): Promise<void> {
  const key = keys.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!key) return;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    if (!res.ok) return;
    const body = (await res.json()) as { data?: { total_credits?: number } };
    const purchased = Number(body.data?.total_credits ?? 0);
    const rpd = purchased >= 10 ? 1000 : 50;
    const s = read();
    s.openrouter = { rpd, source: "openrouter-credits", capturedAt: new Date().toISOString() };
    write(s);
  } catch {
    /* leave previous value */
  } finally {
    clearTimeout(t);
  }
}
