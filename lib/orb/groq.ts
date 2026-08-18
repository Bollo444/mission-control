/**
 * orb/groq.ts
 *
 * Direct Groq client for the orb — OpenAI-compatible /v1/chat/completions, so
 * replies stream token-by-token over SSE (the latency budget that keeps the
 * orb feeling real-time). Groq is the orb's brain now: the router picks
 * between the fast and capable models, and Hermes still executes agentic
 * turns. One client, both tiers; the router picks the model id.
 *
 * gpt-oss models are reasoning models — their internal `reasoning` deltas are
 * skipped so the orb only ever speaks the actual answer, never the thinking.
 */

import type { OrbTurnMessage } from "./types";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export interface GroqStreamOptions {
  model: string;
  messages: OrbTurnMessage[];
  apiKey: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface GroqChatResult {
  text: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/** Build the OpenAI-style request body (model + system prompt prepended as a message). */
export function buildBody(opts: GroqStreamOptions): Record<string, unknown> {
  return {
    model: opts.model,
    messages: [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    max_tokens: opts.maxOutputTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
  };
}

function keyHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
}

/** Pull the answer text out of one OpenAI SSE frame — content only, so a
 *  reasoning model's internal thinking is never spoken. */
function frameText(json: Record<string, unknown>): string {
  const choices = Array.isArray(json.choices) ? (json.choices as Record<string, unknown>[]) : [];
  for (const choice of choices) {
    const delta = choice.delta as { content?: string } | undefined;
    if (delta && typeof delta.content === "string") return delta.content;
  }
  return "";
}

/** Parse a buffered SSE stream into JSON frames (skips `data: [DONE]`). */
function* sseFrames(buffer: string): Generator<Record<string, unknown>, void, unknown> {
  const chunks = buffer.split("\n\n");
  // The last chunk may be an incomplete frame; the caller re-buffers it.
  for (const chunk of chunks.slice(0, -1)) {
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const payload = line.slice("data: ".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        yield JSON.parse(payload) as Record<string, unknown>;
      } catch {
        /* skip malformed frame */
      }
    }
  }
}

/**
 * Stream a Groq completion, yielding text deltas as they arrive.
 * Throws on non-2xx or an aborted request (AbortError propagates to the caller).
 */
export async function* streamGroq(opts: GroqStreamOptions): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: keyHeader(opts.apiKey),
    body: JSON.stringify({ ...buildBody(opts), stream: true }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw new Error(`Groq ${res.status}: ${detail || "request failed"}`);
  }
  if (!res.body) throw new Error("Groq returned an empty body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const frame of sseFrames(buf)) {
      const text = frameText(frame);
      if (text) yield text;
    }
    // Keep only the trailing (possibly partial) frame for the next read.
    const lastSplit = buf.lastIndexOf("\n\n");
    buf = lastSplit === -1 ? buf : buf.slice(lastSplit + 2);
  }
}

/** Non-streaming completion — used by status/tests and light one-shot calls. */
export async function groqChat(opts: GroqStreamOptions): Promise<GroqChatResult> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: keyHeader(opts.apiKey),
    body: JSON.stringify(buildBody(opts)),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw new Error(`Groq ${res.status}: ${detail || "request failed"}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = json.choices?.[0];
  return {
    text: (choice?.message?.content ?? "").trim(),
    finishReason: choice?.finish_reason,
    usage: json.usage
      ? {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
        }
      : undefined,
  };
}
