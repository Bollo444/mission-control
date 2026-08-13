import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";
import { PROVIDERS, readSettings, writeSettings, type RouteRule } from "./settings";
import { appendActivity } from "./memory";
import { refreshOpenRouterLimit } from "./livelimits";
import type {
  HealthAction,
  HealthState,
  ProviderHealth,
  ProviderStatus,
} from "./types";

/*
  Free-tier health monitor. The fleet's standing responsibility, mapped to roles:
    • Hermes  — scheduling: triggers this sweep on a timer (see instrumentation.ts)
    • Pi      — measurement: probes each free provider's live /models endpoint
    • OpenCode — routing: fails an agent over to a healthy free model when its own
                 goes dark, and auto-reverts once the preferred model is back.
  Everything is written to the shared Activity Log so the boardroom can see it.
*/

const HEALTH_FILE = path.join(MC_CONFIG_DIR, "health.json");

/** Probe cadence. Default 6h; override with MC_HEALTH_INTERVAL_MIN. */
export const INTERVAL_MIN = Math.max(
  5,
  Number(process.env.MC_HEALTH_INTERVAL_MIN) || 360
);

export function emptyState(): HealthState {
  return {
    lastCheckedAt: null,
    intervalMinutes: INTERVAL_MIN,
    providers: {},
    actions: [],
  };
}

export function readHealth(): HealthState {
  try {
    const raw = fs.readFileSync(HEALTH_FILE, "utf8");
    return { ...emptyState(), ...(JSON.parse(raw) as HealthState) };
  } catch {
    return emptyState();
  }
}

function writeHealth(s: HealthState) {
  fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(HEALTH_FILE, JSON.stringify(s, null, 2), "utf8");
}

// ---------------------------------------------------------------- probing ----

type Keys = Record<string, string>;

interface Probe {
  /** Build the OpenAI-style /models URL, or null when config is missing. */
  url: (k: Keys) => string | null;
  /** apiKey/settings name used as a Bearer token (and to detect "configured"). */
  tokenName?: string;
  /** When true, a missing token => unconfigured (no probe attempted). */
  required?: boolean;
  extraHeaders?: Record<string, string>;
  /** Pull model ids out of the response body. */
  extract?: (j: unknown) => string[];
}

function key(k: Keys, name: string): string | undefined {
  return k[name] || process.env[name];
}

/** Default extractor for OpenAI-compatible `{ data: [{ id }] }` and array bodies. */
function dataIds(j: unknown): string[] {
  const body = j as { data?: Array<{ id?: string }> } | Array<{ id?: string; name?: string }>;
  if (Array.isArray(body)) {
    return body.map((m) => m.id ?? (m as { name?: string }).name).filter(Boolean) as string[];
  }
  if (body && Array.isArray(body.data)) {
    return body.data.map((m) => m.id).filter(Boolean) as string[];
  }
  return [];
}

/**
 * Per-provider availability probes. Providers without an entry (nous, kilo) are
 * reported as "unknown" — no reliable public model-list endpoint is wired, so
 * the monitor never fails an agent off them on a guess.
 */
const PROBES: Record<string, Probe> = {
  cloudflare: {
    tokenName: "CLOUDFLARE_API_TOKEN",
    required: true,
    url: (k) => {
      const acct = key(k, "CLOUDFLARE_ACCOUNT_ID");
      // Workers AI lists models via the REST catalog. The OpenAI-compatible
      // /ai/v1/models path only serves POST inference (a GET returns HTTP 405).
      return acct
        ? `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/models/search?per_page=1000`
        : null;
    },
    extract: (j) => {
      const body = j as { result?: Array<{ name?: string }> };
      return Array.isArray(body?.result)
        ? (body.result.map((m) => m.name).filter(Boolean) as string[])
        : [];
    },
  },
  groq: {
    tokenName: "GROQ_API_KEY",
    required: true,
    url: () => "https://api.groq.com/openai/v1/models",
    extract: dataIds,
  },
  cerebras: {
    tokenName: "CEREBRAS_API_KEY",
    required: true,
    url: () => "https://api.cerebras.ai/v1/models",
    extract: dataIds,
  },
  mistral: {
    tokenName: "MISTRAL_API_KEY",
    required: true,
    url: () => "https://api.mistral.ai/v1/models",
    extract: dataIds,
  },
  github: {
    tokenName: "GITHUB_TOKEN",
    required: true,
    url: () => "https://models.github.ai/catalog/models",
    extraHeaders: { "X-GitHub-Api-Version": "2026-03-10" },
    extract: dataIds,
  },
  kilo: {
    // Kilo Code's catalog; model ids live in each entry's `openrouterId`.
    tokenName: "KILOCODE_API_KEY",
    required: true,
    url: () => "https://kilocode.ai/api/models",
    extract: (j) => {
      const arr = j as Array<{ openrouterId?: string }>;
      return Array.isArray(arr)
        ? (arr.map((m) => m.openrouterId).filter(Boolean) as string[])
        : [];
    },
  },
  openrouter: {
    // Public model listing — no key required to check availability.
    tokenName: "OPENROUTER_API_KEY",
    url: () => "https://openrouter.ai/api/v1/models",
    extract: dataIds,
  },
  opencode: {
    tokenName: "OPENCODE_API_KEY",
    url: () => "https://opencode.ai/zen/v1/models",
    extract: dataIds,
  },
  nim: {
    tokenName: "NVIDIA_API_KEY",
    required: true,
    url: () => "https://integrate.api.nvidia.com/v1/models",
    extract: dataIds,
  },
  local: {
    url: (k) => {
      const base = (key(k, "LOCAL_BASE_URL") || "http://127.0.0.1:1234/v1").replace(/\/$/, "");
      return `${base}/models`;
    },
    extract: dataIds,
  },
};

interface ProbeResult {
  status: ProviderStatus;
  ids: string[] | null;
  detail?: string;
}

async function probeProvider(provId: string, keys: Keys): Promise<ProbeResult> {
  const probe = PROBES[provId];
  if (!probe) return { status: "unknown", ids: null, detail: "no availability probe wired" };

  const token = probe.tokenName ? key(keys, probe.tokenName) : undefined;
  if (probe.required && !token) {
    return { status: "unconfigured", ids: null, detail: `set ${probe.tokenName} to enable checks` };
  }
  const url = probe.url(keys);
  if (!url) return { status: "unconfigured", ids: null, detail: "missing config (e.g. account id)" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(probe.extraHeaders ?? {}),
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        // Auth failure with a key is a real problem; without a key it just means
        // we cannot check this provider yet.
        return { status: token ? "unavailable" : "unconfigured", ids: null, detail: `auth ${res.status}` };
      }
      if (res.status === 429) {
        // Rate-limited, not down. Leave models unverified so we never fail an
        // agent over on a transient throttle.
        return { status: "unknown", ids: null, detail: "rate-limited (429)" };
      }
      return { status: "unavailable", ids: null, detail: `HTTP ${res.status}` };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    const ids = (probe.extract ?? dataIds)(json);
    return { status: "available", ids, detail: `${ids.length} models live` };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { status: "unavailable", ids: null, detail: aborted ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** Normalize a model id for cross-source comparison. We deliberately do NOT
 *  strip ":free": on OpenRouter the ":free" id is a distinct routable model, so
 *  collapsing it onto the paid base id would report a removed free variant as
 *  available. We only tolerate OpenCode Zen's optional "opencode/" namespace. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/^opencode\//, "").trim();
}

/** true=present, false=confirmed missing, null=unverified (no live list). */
export function modelStatus(ids: string[] | null | undefined, model: string): boolean | null {
  if (!ids) return null;
  const set = new Set(ids.map(norm));
  return set.has(norm(model));
}

// ------------------------------------------------------------- failover ------

/**
 * Priority list of healthy free fallbacks, coding-capable first. The monitor
 * picks the first one that is *confirmed available* this sweep.
 */
const FALLBACKS: RouteRule[] = [
  { provider: "nim", model: "nvidia/llama-3.3-nemotron-super-49b-v1.5" },
  { provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct" },
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "cerebras", model: "gpt-oss-120b" },
  { provider: "openrouter", model: "qwen/qwen3-coder:free" },
  { provider: "mistral", model: "codestral-latest" },
  { provider: "github", model: "openai/gpt-4o-mini" },
  { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
  { provider: "opencode", model: "big-pickle" },
];

function summarize(providers: Record<string, ProviderHealth>) {
  let available = 0,
    unavailable = 0,
    unconfigured = 0,
    unknown = 0;
  for (const p of Object.values(providers)) {
    if (p.status === "available") available++;
    else if (p.status === "unavailable") unavailable++;
    else if (p.status === "unconfigured") unconfigured++;
    else unknown++;
  }
  return { available, unavailable, unconfigured, unknown };
}

function logActivity(agentId: string, agentName: string, action: string, detail?: string) {
  try {
    appendActivity({ agentId, agentName, action, detail });
  } catch {
    /* vault may be unwritable; never let logging break the sweep */
  }
}

let running = false;

/**
 * Probe every free provider, persist availability, and apply auto-failover /
 * auto-revert to agents routed at free providers. Safe to call concurrently
 * (overlapping calls are coalesced). Returns the fresh HealthState.
 */
export async function runHealthCheck(opts: { scheduled?: boolean } = {}): Promise<HealthState> {
  if (running) return readHealth();
  running = true;
  try {
    const settings = readSettings();
    const keys = settings.apiKeys;
    const freeProviders = PROVIDERS.filter((p) => p.free);
    const freeIds = new Set(freeProviders.map((p) => p.id));
    const now = new Date().toISOString();

    const probed = await Promise.all(
      freeProviders.map(async (p) => {
        const r = await probeProvider(p.id, keys);
        const models: Record<string, boolean | null> = {};
        for (const m of p.models) models[m] = modelStatus(r.ids, m);
        const ph: ProviderHealth = {
          id: p.id,
          status: r.status,
          checkedAt: now,
          detail: r.detail,
          models,
        };
        return ph;
      })
    );
    const providers: Record<string, ProviderHealth> = {};
    for (const ph of probed) providers[ph.id] = ph;

    // Refresh OpenRouter's live free-tier daily limit from credits purchased.
    await refreshOpenRouterLimit(keys).catch(() => {});

    // A model is "confirmed bad" if its whole provider endpoint is down, or the
    // provider answered but the model is absent from the live list. Unconfigured
    // / unknown providers never trigger a failover.
    const confirmedBad = (provider: string, model: string): boolean => {
      const ph = providers[provider];
      if (!ph) return false;
      if (ph.status === "unavailable") return true;
      if (ph.status === "available") return ph.models[model] === false;
      return false;
    };
    const confirmedGood = (provider: string, model: string): boolean => {
      const ph = providers[provider];
      return Boolean(ph && ph.status === "available" && ph.models[model] === true);
    };
    const pickFallback = (exclude: RouteRule): RouteRule | null => {
      for (const c of FALLBACKS) {
        if (c.provider === exclude.provider && c.model === exclude.model) continue;
        if (confirmedGood(c.provider, c.model)) return c;
      }
      return null;
    };

    const actions: HealthAction[] = [];
    const changed: Record<string, RouteRule> = {};
    const fmt = (r: RouteRule) => `${r.provider}/${r.model}`;

    for (const agentId of Object.keys(settings.routing)) {
      const eff = settings.routing[agentId];
      const pref = settings.routingPreferred[agentId] ?? eff;
      if (!eff) continue;
      const failedOver = eff.provider !== pref.provider || eff.model !== pref.model;

      // 1) Recover: was on a fallback, and the preferred free model is back.
      if (failedOver && freeIds.has(pref.provider) && confirmedGood(pref.provider, pref.model)) {
        changed[agentId] = pref;
        actions.push({
          ts: now,
          agentId,
          kind: "restore",
          from: fmt(eff),
          to: fmt(pref),
          reason: "preferred model back online",
        });
        continue;
      }

      // 2) Fail over: current free route is confirmed bad — move to a healthy one.
      if (freeIds.has(eff.provider) && confirmedBad(eff.provider, eff.model)) {
        const fb = pickFallback(eff);
        if (fb) {
          changed[agentId] = fb;
          actions.push({
            ts: now,
            agentId,
            kind: "failover",
            from: fmt(eff),
            to: fmt(fb),
            reason:
              providers[eff.provider]?.status === "unavailable"
                ? "provider endpoint down"
                : "model unavailable",
          });
        }
      }
    }

    // Apply effective-routing changes only — preferred is never touched here.
    if (Object.keys(changed).length) writeSettings({ routing: changed });

    // ---- activity feed (the three responsible agents, doing their jobs) ----
    if (opts.scheduled) {
      logActivity("hermes", "Hermes", "ran scheduled free-tier sweep", `every ${INTERVAL_MIN} min`);
    }
    const c = summarize(providers);
    logActivity(
      "pi",
      "Pi",
      "free-tier availability sweep",
      `${c.available} available · ${c.unavailable} down · ${c.unconfigured} unconfigured · ${c.unknown} unknown`
    );
    for (const a of actions) {
      logActivity(
        "opencode",
        "OpenCode",
        `${a.kind === "failover" ? "re-routed" : "restored"} ${a.agentId}`,
        `${a.from} → ${a.to} · ${a.reason}`
      );
    }

    const prev = readHealth();
    const state: HealthState = {
      lastCheckedAt: now,
      intervalMinutes: INTERVAL_MIN,
      providers,
      actions: [...actions, ...prev.actions].slice(0, 40),
    };
    writeHealth(state);
    return state;
  } finally {
    running = false;
  }
}

// ------------------------------------------------------------- scheduler -----

/**
 * Start the periodic sweep. Idempotent across hot reloads / multiple server
 * inits via a global guard. Runs once shortly after boot, then every interval.
 */
export function startHealthScheduler() {
  const g = globalThis as unknown as { __mcHealthStarted?: boolean };
  if (g.__mcHealthStarted) return;
  g.__mcHealthStarted = true;

  const tick = () => {
    runHealthCheck({ scheduled: true }).catch(() => {});
  };
  setTimeout(tick, 15_000);
  setInterval(tick, INTERVAL_MIN * 60_000);
}
