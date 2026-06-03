import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { MC_CONFIG_DIR, MC_SETTINGS_FILE, VAULT_DIR } from "./paths";
import { logEvent } from "./logbook";
import { encryptSecret, decryptSecret, encryptionEnabled } from "./secretbox";

function mapValues(obj: Record<string, string>, fn: (v: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = fn(v);
  return out;
}

export interface RouteRule {
  provider: string;
  model: string;
}

export interface Settings {
  vaultDir: string;
  /** Effective route actually in use per agent — may be a health failover. */
  routing: Record<string, RouteRule>;
  /** The user's chosen default per agent. Failover never overwrites this; it is
   *  what the fleet auto-reverts an agent to once its model is healthy again. */
  routingPreferred: Record<string, RouteRule>;
  apiKeys: Record<string, string>; // provider key name -> value (never sent raw to client)
  /** Mission Control's own Fleet Gateway access token (shown to you — not a third-party secret). */
  gatewayToken?: string;
  updatedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  keyEnv: string;
  models: string[];
  /** Offers a no-cost / free tier — surfaced as a badge in the routing UI. */
  free?: boolean;
}

/**
 * Catalog of providers + representative models for the routing UI.
 * Any agent can be routed to ANY provider here — free providers (Nous, Kilo,
 * OpenCode Zen, OpenRouter :free, Mistral, Local) are available to every agent,
 * not just the one that shipped them.
 */
export const PROVIDERS: Provider[] = [
  {
    id: "nous",
    name: "Nous Research",
    keyEnv: "NOUS_API_KEY",
    free: true,
    models: [
      "Hermes-4-405B",
      "Hermes-4-70B",
      "DeepHermes-3-Llama-3-8B-Preview",
      "Hermes-3-Llama-3.1-405B",
    ],
  },
  {
    id: "kilo",
    name: "Kilo (free tier)",
    keyEnv: "KILOCODE_API_KEY",
    free: true,
    // Real Kilo ids (its API exposes them as `openrouterId`). grok-code-fast-1
    // is Kilo's free coding model; the ":free" ones are no-cost too.
    models: [
      "x-ai/grok-code-fast-1",
      "inclusionai/ling-2.6-flash:free",
      "inclusionai/ling-2.6-1t:free",
      "google/gemma-4-26b-a4b-it:free",
    ],
  },
  {
    // OpenCode Zen — OpenAI/Anthropic-compatible gateway at https://opencode.ai/zen/v1
    // (key: OPENCODE_API_KEY from https://opencode.ai/auth). The "*-free" models and
    // Big Pickle carry no per-request cost. Selectable by every agent, not just OpenCode.
    id: "opencode",
    name: "OpenCode Zen",
    keyEnv: "OPENCODE_API_KEY",
    free: true,
    models: [
      "big-pickle",
      "deepseek-v4-flash-free",
      "mimo-v2.5-free",
      "nemotron-3-super-free",
    ],
  },
  {
    // GroqCloud — OpenAI-compatible at https://api.groq.com/openai/v1 (key: GROQ_API_KEY).
    // Free tier, no card; ultra-fast LPU inference, rate-limited per model.
    id: "groq",
    name: "Groq",
    keyEnv: "GROQ_API_KEY",
    free: true,
    models: [
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
      "meta-llama/llama-4-scout-17b-16e-instruct",
    ],
  },
  {
    // Cerebras — OpenAI-compatible at https://api.cerebras.ai/v1 (key: CEREBRAS_API_KEY).
    // Free tier ~1M tokens/day, no card. Hosts the qwen-3-coder coding model.
    id: "cerebras",
    name: "Cerebras",
    keyEnv: "CEREBRAS_API_KEY",
    free: true,
    // Cerebras free tier currently exposes only these (it rotates availability).
    models: ["gpt-oss-120b", "zai-glm-4.7"],
  },
  {
    // GitHub Models — OpenAI-compatible at https://models.github.ai/inference
    // (key: GITHUB_TOKEN, a PAT with models:read). Free prototyping tier for all
    // GitHub users; broad multi-vendor catalog, rate-limited.
    id: "github",
    name: "GitHub Models",
    keyEnv: "GITHUB_TOKEN",
    free: true,
    models: [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "openai/gpt-5-mini",
      "meta/llama-3.3-70b-instruct",
      "deepseek/deepseek-r1",
      "microsoft/phi-4",
      "xai/grok-3-mini",
    ],
  },
  {
    // Cloudflare Workers AI — OpenAI-compatible at
    //   https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/v1
    // Key: CLOUDFLARE_API_TOKEN (a token with Workers AI Read + Run). The endpoint
    // also embeds your account id; store it as CLOUDFLARE_ACCOUNT_ID. Free tier:
    // 10k Neurons/day, no card.
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    keyEnv: "CLOUDFLARE_API_TOKEN",
    free: true,
    models: [
      "@cf/qwen/qwen2.5-coder-32b-instruct",
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      "@cf/openai/gpt-oss-120b",
      "@cf/zai-org/glm-4.7-flash",
    ],
  },
  {
    // NVIDIA NIM — OpenAI-compatible at https://integrate.api.nvidia.com/v1
    // (key: NVIDIA_API_KEY, an "nvapi-..." key from build.nvidia.com). Free dev
    // tier: 1,000 credits on signup (up to 5,000), 40 req/min, 80+ hosted models.
    id: "nim",
    name: "NVIDIA NIM",
    keyEnv: "NVIDIA_API_KEY",
    free: true,
    models: [
      "qwen/qwen3-coder-480b-a35b-instruct",
      "deepseek-ai/deepseek-v4-pro",
      "meta/llama-3.3-70b-instruct",
      "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      "moonshotai/kimi-k2.6",
      "openai/gpt-oss-120b",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    keyEnv: "ANTHROPIC_API_KEY",
    models: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  },
  {
    id: "openai",
    name: "OpenAI",
    keyEnv: "OPENAI_API_KEY",
    models: ["gpt-5.1", "gpt-5.1-mini", "o4"],
  },
  {
    id: "mistral",
    name: "Mistral",
    keyEnv: "MISTRAL_API_KEY",
    free: true,
    models: [
      "codestral-latest",
      "devstral-medium-latest",
      "mistral-medium-3.5",
      "mistral-small-latest",
      "ministral-8b-latest",
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    keyEnv: "OPENROUTER_API_KEY",
    free: true,
    // Full OpenRouter free-tier catalog (ids ending ":free") + two paid
    // pass-throughs kept for existing routes (e.g. jcode → openai/gpt-5.1).
    // The health monitor verifies each against OpenRouter's live list.
    models: [
      // ---- Coding ----
      "qwen/qwen3-coder:free",
      "poolside/laguna-m.1:free",
      "poolside/laguna-xs.2:free",
      // ---- Uncensored (un-aligned by design — not a jailbreak) ----
      "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
      // ---- General (large) ----
      "nousresearch/hermes-3-llama-3.1-405b:free",
      "openai/gpt-oss-120b:free",
      "openai/gpt-oss-20b:free",
      "qwen/qwen3-next-80b-a3b-instruct:free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "moonshotai/kimi-k2.6:free",
      "z-ai/glm-4.5-air:free",
      "google/gemma-4-31b-it:free",
      "google/gemma-4-26b-a4b-it:free",
      // ---- NVIDIA Nemotron (incl. vision + 1M-context) ----
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-3-nano-30b-a3b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "nvidia/nemotron-nano-12b-v2-vl:free",
      "nvidia/nemotron-nano-9b-v2:free",
      // ---- Small / edge ----
      "meta-llama/llama-3.2-3b-instruct:free",
      "liquid/lfm-2.5-1.2b-instruct:free",
      "liquid/lfm-2.5-1.2b-thinking:free",
      // ---- Paid pass-throughs (kept for existing routes) ----
      "anthropic/claude-opus-4.8",
      "openai/gpt-5.1",
    ],
  },
  {
    id: "google",
    name: "Google",
    keyEnv: "GEMINI_API_KEY",
    models: ["gemini-3-pro", "gemini-3-flash"],
  },
  {
    id: "local",
    name: "Local (LM Studio / llama.cpp)",
    keyEnv: "LOCAL_API_KEY",
    free: true,
    models: ["local-default", "devstral", "qwen3-coder"],
  },
];

/** The fleet's out-of-the-box routing. Used for both effective + preferred. */
const DEFAULT_ROUTING: Record<string, RouteRule> = {
  claude: { provider: "anthropic", model: "claude-opus-4-8" },
  hermes: { provider: "nous", model: "Hermes-4-405B" },
  pi: { provider: "openrouter", model: "qwen/qwen3-coder:free" },
  opencode: { provider: "opencode", model: "big-pickle" },
  antigravity: { provider: "google", model: "gemini-3-pro" },
  openclaw: { provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct" },
  jcode: { provider: "cloudflare", model: "@cf/openai/gpt-oss-120b" },
  vibe: { provider: "mistral", model: "mistral-small-latest" },
  kilo: { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
};

const DEFAULTS: Settings = {
  vaultDir: VAULT_DIR,
  routing: DEFAULT_ROUTING,
  routingPreferred: DEFAULT_ROUTING,
  apiKeys: {},
  updatedAt: new Date(0).toISOString(),
};

export function readSettings(): Settings {
  try {
    const raw = fs.readFileSync(MC_SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULTS,
      ...parsed,
      routing: { ...DEFAULTS.routing, ...(parsed.routing ?? {}) },
      // Seed preferred from any saved preferred, else from saved routing (migration
      // for settings written before preferred existed), else the defaults.
      routingPreferred: {
        ...DEFAULTS.routingPreferred,
        ...(parsed.routingPreferred ?? parsed.routing ?? {}),
      },
      apiKeys: mapValues({ ...DEFAULTS.apiKeys, ...(parsed.apiKeys ?? {}) }, decryptSecret),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSettings(next: Partial<Settings>): Settings {
  const merged = readSettings();
  if (next.routing) merged.routing = { ...merged.routing, ...next.routing };
  if (next.routingPreferred)
    merged.routingPreferred = { ...merged.routingPreferred, ...next.routingPreferred };
  if (next.apiKeys) merged.apiKeys = { ...merged.apiKeys, ...next.apiKeys };
  if (next.vaultDir) merged.vaultDir = next.vaultDir;
  if (next.gatewayToken) merged.gatewayToken = next.gatewayToken;
  merged.updatedAt = new Date().toISOString();
  fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  // Encrypt provider keys at rest when MC_ENCRYPTION_KEY is set (no-op otherwise).
  const onDisk = { ...merged, apiKeys: mapValues(merged.apiKeys, encryptSecret) };
  fs.writeFileSync(MC_SETTINGS_FILE, JSON.stringify(onDisk, null, 2), "utf8");
  const changed: string[] = [];
  if (next.routing) changed.push(`routing[${Object.keys(next.routing).join(",")}]`);
  if (next.routingPreferred) changed.push(`preferred[${Object.keys(next.routingPreferred).join(",")}]`);
  if (next.apiKeys) changed.push(`keys[${Object.keys(next.apiKeys).join(",")}]`); // names only, never values
  if (next.vaultDir) changed.push("vaultDir");
  if (next.gatewayToken) changed.push("gatewayToken");
  logEvent({ source: "settings", level: "info", event: "settings updated", detail: changed.join(" · ") || "—" });
  return merged;
}

/** Mission Control's own gateway access token — generated + persisted on first use. */
export function getGatewayToken(): string {
  const s = readSettings();
  if (s.gatewayToken && s.gatewayToken.length >= 16) return s.gatewayToken;
  const tok = "mcg_" + crypto.randomBytes(24).toString("hex");
  writeSettings({ gatewayToken: tok });
  return tok;
}

/**
 * Approximate free-tier allowances per provider, surfaced under the routing
 * table so you can gauge roughly how much you can use each one before it needs
 * paid credits. Ballpark figures — providers change these frequently.
 */
const FREE_LIMITS: Record<string, string> = {
  nous: "Open-beta free credits, then paid — light rate limits",
  kilo: "Free rotating model (currently Grok Code Fast 1) — rate-limited, no fixed quota",
  opencode: "Free models (Big Pickle, *-free): no token cost, but capped daily free usage + rate limits",
  groq: "~30 req/min · ~1,000 req/day (Llama-3.1-8B: 14,400/day) · 6K tokens/min — no card",
  cerebras: "~1,000,000 tokens/day · ~30 req/min · 8K context cap — no card",
  github: "Any GitHub account — ~10–15 req/min · ~50–150 req/day · 8K in / 4K out per request",
  mistral: "Free 'Experiment' tier — ~1 req/sec · ~500K tokens/min · ~1B tokens/month (phone-verified)",
  openrouter: "':free' models — 20 req/min · 50 req/day (→ 1,000/day after a one-time $10 top-up)",
  cloudflare: "Free 10,000 Neurons/day (~hundreds of small requests/day)",
  nim: "Free dev tier — 1,000 credits on signup (up to 5,000) · 40 req/min · 80+ models (key: nvapi-…)",
  local: "Unlimited — runs on your own hardware (LM Studio / llama.cpp); limited only by your machine",
};

/** Client-safe view: API keys reduced to "configured" booleans. */
export function publicSettings(s: Settings) {
  const keyStatus: Record<string, boolean> = {};
  for (const prov of PROVIDERS) {
    keyStatus[prov.keyEnv] = Boolean(
      s.apiKeys[prov.keyEnv] || process.env[prov.keyEnv]
    );
  }
  return {
    vaultDir: s.vaultDir,
    routing: s.routing,
    routingPreferred: s.routingPreferred,
    keyStatus,
    gatewayToken: s.gatewayToken ?? "",
    encryption: encryptionEnabled(),
    updatedAt: s.updatedAt,
    providers: PROVIDERS.map((p) => ({ ...p, freeLimit: FREE_LIMITS[p.id] })),
  };
}

export { MC_SETTINGS_FILE, path };
