import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR, MC_SETTINGS_FILE, VAULT_DIR } from "./paths";

export interface RouteRule {
  provider: string;
  model: string;
}

export interface Settings {
  vaultDir: string;
  routing: Record<string, RouteRule>; // agentId -> route
  apiKeys: Record<string, string>; // provider key name -> value (never sent raw to client)
  updatedAt: string;
}

export interface Provider {
  id: string;
  name: string;
  keyEnv: string;
  models: string[];
}

/** Catalog of providers + representative models for the routing UI. */
export const PROVIDERS: Provider[] = [
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
    models: ["mistral-medium-3.5", "devstral-small", "codestral-latest"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    keyEnv: "OPENROUTER_API_KEY",
    models: ["anthropic/claude-opus-4.8", "openai/gpt-5.1", "qwen/qwen-3-coder"],
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
    models: ["local-default", "devstral", "qwen3-coder"],
  },
];

const DEFAULTS: Settings = {
  vaultDir: VAULT_DIR,
  routing: {
    claude: { provider: "anthropic", model: "claude-opus-4-8" },
    hermes: { provider: "openrouter", model: "anthropic/claude-opus-4.8" },
    pi: { provider: "openai", model: "gpt-5.1" },
    opencode: { provider: "openrouter", model: "qwen/qwen-3-coder" },
    antigravity: { provider: "google", model: "gemini-3-pro" },
    jcode: { provider: "openrouter", model: "openai/gpt-5.1" },
    vibe: { provider: "mistral", model: "mistral-medium-3.5" },
    kilo: { provider: "local", model: "local-default" },
  },
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
      apiKeys: { ...DEFAULTS.apiKeys, ...(parsed.apiKeys ?? {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSettings(next: Partial<Settings>): Settings {
  const merged = readSettings();
  if (next.routing) merged.routing = { ...merged.routing, ...next.routing };
  if (next.apiKeys) merged.apiKeys = { ...merged.apiKeys, ...next.apiKeys };
  if (next.vaultDir) merged.vaultDir = next.vaultDir;
  merged.updatedAt = new Date().toISOString();
  fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(MC_SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

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
    keyStatus,
    updatedAt: s.updatedAt,
    providers: PROVIDERS,
  };
}

export { MC_SETTINGS_FILE, path };
