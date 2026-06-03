import { PROVIDERS, readSettings, type RouteRule } from "./settings";
import { logEvent } from "./logbook";

/*
  Fleet Gateway — one OpenAI-compatible endpoint in front of every configured
  free provider. A request is routed to a primary (explicit model, per-agent
  preference, or "auto"), and on a rate-limit / error it cascades to the next
  healthy provider with a short cooldown — so a single call rarely fails.

  Inspired by FreeLLMAPI, but native to Mission Control: no second service, no
  database, JSON/in-memory state only, and it makes the routing table live for
  any agent that points its base URL here.
*/

type Keys = Record<string, string>;

function key(k: Keys, name: string): string | undefined {
  return k[name] || process.env[name];
}

interface ChatProvider {
  id: string;
  keyName: string;
  /** Needs a key to serve inference (everything except a local server). */
  requiresKey: boolean;
  url: (k: Keys) => string | null;
  extraHeaders?: Record<string, string>;
}

/** Providers that expose an OpenAI-compatible /chat/completions endpoint. */
const CHAT: Record<string, ChatProvider> = {
  cerebras: { id: "cerebras", keyName: "CEREBRAS_API_KEY", requiresKey: true, url: () => "https://api.cerebras.ai/v1/chat/completions" },
  nim: { id: "nim", keyName: "NVIDIA_API_KEY", requiresKey: true, url: () => "https://integrate.api.nvidia.com/v1/chat/completions" },
  groq: { id: "groq", keyName: "GROQ_API_KEY", requiresKey: true, url: () => "https://api.groq.com/openai/v1/chat/completions" },
  cloudflare: {
    id: "cloudflare",
    keyName: "CLOUDFLARE_API_TOKEN",
    requiresKey: true,
    url: (k) => {
      const acct = key(k, "CLOUDFLARE_ACCOUNT_ID");
      return acct ? `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/v1/chat/completions` : null;
    },
  },
  mistral: { id: "mistral", keyName: "MISTRAL_API_KEY", requiresKey: true, url: () => "https://api.mistral.ai/v1/chat/completions" },
  github: {
    id: "github",
    keyName: "GITHUB_TOKEN",
    requiresKey: true,
    url: () => "https://models.github.ai/inference/chat/completions",
    extraHeaders: { "X-GitHub-Api-Version": "2026-03-10" },
  },
  openrouter: {
    id: "openrouter",
    keyName: "OPENROUTER_API_KEY",
    requiresKey: true,
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    extraHeaders: { "HTTP-Referer": "http://127.0.0.1:4317", "X-Title": "Mission Control" },
  },
  opencode: { id: "opencode", keyName: "OPENCODE_API_KEY", requiresKey: true, url: () => "https://opencode.ai/zen/v1/chat/completions" },
  local: {
    id: "local",
    keyName: "LOCAL_API_KEY",
    requiresKey: false,
    url: (k) => `${(key(k, "LOCAL_BASE_URL") || "http://127.0.0.1:1234/v1").replace(/\/$/, "")}/chat/completions`,
  },
};

/** "auto" priority — coding-leaning, across providers. Filtered to configured ones. */
const AUTO: RouteRule[] = [
  { provider: "cerebras", model: "gpt-oss-120b" },
  { provider: "nim", model: "qwen/qwen3-coder-480b-a35b-instruct" },
  { provider: "groq", model: "llama-3.3-70b-versatile" },
  { provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct" },
  { provider: "openrouter", model: "qwen/qwen3-coder:free" },
  { provider: "mistral", model: "codestral-latest" },
  { provider: "github", model: "openai/gpt-4o-mini" },
  { provider: "opencode", model: "big-pickle" },
];

const COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 8;
const cooldownUntil = new Map<string, number>();

function isCooled(provider: string): boolean {
  const until = cooldownUntil.get(provider);
  return until !== undefined && Date.now() < until;
}
function cool(provider: string) {
  cooldownUntil.set(provider, Date.now() + COOLDOWN_MS);
}

function hasKey(keys: Keys, p: ChatProvider): boolean {
  if (!p.requiresKey) return true;
  return Boolean(key(keys, p.keyName) && (p.id !== "cloudflare" || key(keys, "CLOUDFLARE_ACCOUNT_ID")));
}

/** Find the provider whose catalog lists `model` (preferring a chat provider). */
function providerForModel(model: string): string | null {
  for (const p of PROVIDERS) {
    if (CHAT[p.id] && p.models.includes(model)) return p.id;
  }
  return null;
}

/** Resolve the primary route from an explicit model id, else per-agent, else null. */
function resolvePrimary(model: string | undefined, agentId: string | undefined, keys: Keys): RouteRule | null {
  const m = (model ?? "").trim();
  if (m && m.toLowerCase() !== "auto") {
    const slash = m.indexOf("/");
    const head = slash > 0 ? m.slice(0, slash) : "";
    if (head && CHAT[head]) return { provider: head, model: m.slice(slash + 1) };
    const owner = providerForModel(m);
    if (owner) return { provider: owner, model: m };
    if (m.includes("/")) return { provider: "openrouter", model: m }; // looks like an OpenRouter slug
    return null;
  }
  // No explicit model: use this agent's preferred route if it's a chat provider.
  if (agentId) {
    const pref = readSettings().routingPreferred[agentId];
    if (pref && CHAT[pref.provider]) return pref;
  }
  return null;
}

function buildCandidates(primary: RouteRule | null, keys: Keys): RouteRule[] {
  const ordered: RouteRule[] = [];
  const seen = new Set<string>();
  const push = (r: RouteRule) => {
    const id = `${r.provider}/${r.model}`;
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(r);
  };
  if (primary) push(primary);
  for (const r of AUTO) push(r);
  return ordered.filter((r) => {
    const p = CHAT[r.provider];
    return p && hasKey(keys, p) && !isCooled(r.provider);
  });
}

export interface CascadeOk {
  ok: true;
  response: Response;
  served: RouteRule;
  attempts: number;
}
export interface CascadeErr {
  ok: false;
  status: number;
  error: string;
  attempts: number;
}

/**
 * Try the requested model, then cascade across providers on rate-limit/error.
 * Returns the first OK upstream response (body intact for streaming).
 */
export async function cascadeChat(
  body: Record<string, unknown>,
  opts: { agentId?: string } = {}
): Promise<CascadeOk | CascadeErr> {
  const settings = readSettings();
  const keys = settings.apiKeys;
  const primary = resolvePrimary(body.model as string | undefined, opts.agentId, keys);
  const candidates = buildCandidates(primary, keys).slice(0, MAX_ATTEMPTS);

  if (candidates.length === 0) {
    return { ok: false, status: 503, error: "No free chat providers are configured (add a provider key in Settings).", attempts: 0 };
  }

  let attempts = 0;
  let lastStatus = 0;
  let lastText = "";
  for (const cand of candidates) {
    const p = CHAT[cand.provider];
    const url = p.url(keys);
    if (!url) continue;
    attempts++;
    const token = key(keys, p.keyName);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(p.extraHeaders ?? {}),
    };
    const reqBody = JSON.stringify({ ...body, model: cand.model });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const upstream = await fetch(url, { method: "POST", headers, body: reqBody, signal: ctrl.signal });
      clearTimeout(timer);
      if (upstream.ok) {
        logEvent({
          source: "gateway",
          level: attempts > 1 ? "success" : "info",
          event: "served",
          detail: `${cand.provider}/${cand.model}${attempts > 1 ? ` (after ${attempts - 1} fallback${attempts > 2 ? "s" : ""})` : ""}`,
          meta: { agentId: opts.agentId, attempts },
        });
        return { ok: true, response: upstream, served: cand, attempts };
      }
      lastStatus = upstream.status;
      lastText = (await upstream.text().catch(() => "")).slice(0, 160);
      if (upstream.status === 429 || upstream.status >= 500) cool(cand.provider);
      logEvent({
        source: "gateway",
        level: "warn",
        event: `${cand.provider} ${upstream.status}`,
        detail: `${cand.model} — cascading`,
        meta: { agentId: opts.agentId },
      });
    } catch (e) {
      clearTimeout(timer);
      cool(cand.provider);
      lastStatus = 0;
      lastText = e instanceof Error && e.name === "AbortError" ? "timeout" : "unreachable";
      logEvent({ source: "gateway", level: "warn", event: `${cand.provider} ${lastText}`, detail: `${cand.model} — cascading`, meta: { agentId: opts.agentId } });
    }
  }

  logEvent({ source: "gateway", level: "error", event: "all providers exhausted", detail: `tried ${attempts}`, meta: { agentId: opts.agentId } });
  return { ok: false, status: 503, error: `All providers are rate-limited or unavailable right now (tried ${attempts}). Last: ${lastStatus} ${lastText}`, attempts };
}

/** Union of every configured provider's catalog models — for GET /v1/models. */
export function gatewayModels(): { id: string; owned_by: string }[] {
  const keys = readSettings().apiKeys;
  const out: { id: string; owned_by: string }[] = [];
  for (const p of PROVIDERS) {
    const cp = CHAT[p.id];
    if (!cp || !hasKey(keys, cp)) continue;
    for (const m of p.models) out.push({ id: `${p.id}/${m}`, owned_by: p.id });
  }
  out.push({ id: "auto", owned_by: "mission-control" });
  return out;
}

export { CHAT };
