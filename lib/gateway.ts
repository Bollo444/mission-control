import crypto from "node:crypto";
import { PROVIDERS, readSettings, type RouteRule } from "./settings";
import { logEvent } from "./logbook";
import { recordAttempt, overBudget } from "./usage";
import { recordHeaders } from "./livelimits";

/*
  Fleet Gateway — one OpenAI-compatible endpoint in front of every configured
  free provider. A request is routed to a primary (explicit model, per-agent
  preference, "auto", or a sticky-session model) and cascades across healthy,
  under-budget providers on rate-limit/error with a short cooldown.

  Inspired by FreeLLMAPI, native to Mission Control: no second service, no
  database — in-memory cooldowns/sessions + the ~/.mission-control JSON store.
  Adds: usage-aware budget pre-checks, 30-minute sticky sessions, and vision
  routing (image requests go to vision-capable models).
*/

type Keys = Record<string, string>;

function key(k: Keys, name: string): string | undefined {
  return k[name] || process.env[name];
}

interface ChatProvider {
  id: string;
  keyName: string;
  requiresKey: boolean;
  url: (k: Keys) => string | null;
  extraHeaders?: Record<string, string>;
}

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

/** Vision-capable free models, for requests that include images. */
const VISION: RouteRule[] = [
  { provider: "github", model: "openai/gpt-4o" },
  { provider: "openrouter", model: "nvidia/nemotron-nano-12b-v2-vl:free" },
  { provider: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct" },
];

const COOLDOWN_MS = 60_000;
const STICKY_MS = 30 * 60_000;
const MAX_ATTEMPTS = 8;

const cooldownUntil = new Map<string, number>();
const stickyRoutes = new Map<string, { route: RouteRule; until: number }>();

const isCooled = (p: string) => {
  const u = cooldownUntil.get(p);
  return u !== undefined && Date.now() < u;
};
const cool = (p: string) => cooldownUntil.set(p, Date.now() + COOLDOWN_MS);

function hasKey(keys: Keys, p: ChatProvider): boolean {
  if (!p.requiresKey) return true;
  return Boolean(key(keys, p.keyName) && (p.id !== "cloudflare" || key(keys, "CLOUDFLARE_ACCOUNT_ID")));
}

function providerForModel(model: string): string | null {
  for (const p of PROVIDERS) if (CHAT[p.id] && p.models.includes(model)) return p.id;
  return null;
}

function resolvePrimary(model: string | undefined, agentId: string | undefined, keys: Keys): RouteRule | null {
  const m = (model ?? "").trim();
  if (m && m.toLowerCase() !== "auto") {
    const slash = m.indexOf("/");
    const head = slash > 0 ? m.slice(0, slash) : "";
    if (head && CHAT[head]) return { provider: head, model: m.slice(slash + 1) };
    const owner = providerForModel(m);
    if (owner) return { provider: owner, model: m };
    if (m.includes("/")) return { provider: "openrouter", model: m };
    return null;
  }
  if (agentId) {
    const pref = readSettings().routingPreferred[agentId];
    if (pref && CHAT[pref.provider]) return pref;
  }
  return null;
}

// ---- request introspection ----

function needsVision(body: Record<string, unknown>): boolean {
  const msgs = Array.isArray(body.messages) ? (body.messages as Array<{ content?: unknown }>) : [];
  return msgs.some(
    (m) =>
      Array.isArray(m.content) &&
      (m.content as Array<{ type?: string }>).some((p) => p?.type === "image_url" || p?.type === "image" || p?.type === "input_image")
  );
}

function needsTools(body: Record<string, unknown>): boolean {
  return (
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    (body.tool_choice !== undefined && body.tool_choice !== "none")
  );
}

/** Models that can't take a tool call — route tool requests away from these. */
const TOOL_DENY = /embed|guard|whisper|tts|moderation|-vl\b|vision/i;

function sessionKey(body: Record<string, unknown>, agentId?: string, sessionId?: string): string {
  if (sessionId) return sessionId.slice(0, 64);
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  const seed = `${agentId ?? ""}|${JSON.stringify(msgs.slice(0, 1))}`;
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function getSticky(k: string): RouteRule | undefined {
  const s = stickyRoutes.get(k);
  if (s && Date.now() < s.until && !isCooled(s.route.provider)) return s.route;
  return undefined;
}
function setSticky(k: string, route: RouteRule) {
  stickyRoutes.set(k, { route, until: Date.now() + STICKY_MS });
}

function buildCandidates(
  primary: RouteRule | null,
  keys: Keys,
  opts: { vision: boolean; sticky?: RouteRule; respectBudget: boolean }
): RouteRule[] {
  const base = opts.vision ? VISION : [...(primary ? [primary] : []), ...AUTO];
  const ordered: RouteRule[] = [];
  const seen = new Set<string>();
  const push = (r: RouteRule) => {
    const id = `${r.provider}/${r.model}`;
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(r);
    }
  };
  if (opts.sticky && !opts.vision) push(opts.sticky);
  for (const r of base) push(r);
  return ordered.filter((r) => {
    const p = CHAT[r.provider];
    if (!p || !hasKey(keys, p) || isCooled(r.provider)) return false;
    if (opts.respectBudget && overBudget(r.provider)) return false;
    return true;
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

export async function cascadeChat(
  body: Record<string, unknown>,
  opts: { agentId?: string; sessionId?: string } = {}
): Promise<CascadeOk | CascadeErr> {
  const settings = readSettings();
  const keys = settings.apiKeys;
  const vision = needsVision(body);
  const skey = sessionKey(body, opts.agentId, opts.sessionId);
  const sticky = getSticky(skey);
  const primary = vision ? null : resolvePrimary(body.model as string | undefined, opts.agentId, keys);

  let candidates = buildCandidates(primary, keys, { vision, sticky, respectBudget: true });
  if (candidates.length === 0) {
    // Budgets knocked everyone out — try anyway (cooldown + key checks still apply).
    candidates = buildCandidates(primary, keys, { vision, sticky, respectBudget: false });
  }
  // Tool-aware: keep only tool-capable models for tool-call requests (if any remain).
  const tools = needsTools(body);
  if (tools) {
    const toolCapable = candidates.filter((c) => !TOOL_DENY.test(c.model));
    if (toolCapable.length) candidates = toolCapable;
  }
  candidates = candidates.slice(0, MAX_ATTEMPTS);
  if (tools) {
    logEvent({ source: "gateway", level: "info", event: "tool-call request", detail: `${candidates.length} tool-capable candidate(s)`, meta: { agentId: opts.agentId } });
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      status: 503,
      error: vision
        ? "No vision-capable free provider is configured (add a Groq/GitHub/OpenRouter key)."
        : "No free chat providers are configured (add a provider key in Settings).",
      attempts: 0,
    };
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
    const sendBody: Record<string, unknown> = { ...body, model: cand.model };
    // Ask for usage on streamed responses so the gateway can count tokens.
    if (sendBody.stream === true && sendBody.stream_options === undefined) {
      sendBody.stream_options = { include_usage: true };
    }
    const reqBody = JSON.stringify(sendBody);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    const t0 = Date.now();
    try {
      const upstream = await fetch(url, { method: "POST", headers, body: reqBody, signal: ctrl.signal });
      clearTimeout(timer);
      const latencyMs = Date.now() - t0;
      recordHeaders(cand.provider, upstream.headers, cand.model); // capture live x-ratelimit-* if present
      if (upstream.ok) {
        recordAttempt(cand.provider, { ok: true, latencyMs });
        setSticky(skey, cand);
        logEvent({
          source: "gateway",
          level: attempts > 1 ? "success" : "info",
          event: "served",
          detail: `${cand.provider}/${cand.model}${attempts > 1 ? ` (after ${attempts - 1} fallback${attempts > 2 ? "s" : ""})` : ""}${vision ? " · vision" : ""}`,
          meta: { agentId: opts.agentId, attempts, latencyMs },
        });
        return { ok: true, response: upstream, served: cand, attempts };
      }
      recordAttempt(cand.provider, { ok: false, latencyMs });
      lastStatus = upstream.status;
      lastText = (await upstream.text().catch(() => "")).slice(0, 160);
      if (upstream.status === 429 || upstream.status >= 500) cool(cand.provider);
      logEvent({ source: "gateway", level: "warn", event: `${cand.provider} ${upstream.status}`, detail: `${cand.model} — cascading`, meta: { agentId: opts.agentId } });
    } catch (e) {
      clearTimeout(timer);
      recordAttempt(cand.provider, { ok: false, latencyMs: Date.now() - t0 });
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
