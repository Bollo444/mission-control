/**
 * orb/gemini.ts
 *
 * Direct Google Gemini REST client for the orb. Talks to the v1beta
 * `streamGenerateContent` endpoint (SSE) so replies stream token-by-token —
 * the latency budget that lets the orb feel real-time. One client, both tiers;
 * the router picks the model id.
 */

import type { OrbTurnMessage } from "./types";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiStreamOptions {
  model: string;
  messages: OrbTurnMessage[];
  apiKey: string;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
  /** Extended-thinking token budget (Gemini thinkingConfig). 0 / unset → no thinking. */
  thinkingBudget?: number;
  signal?: AbortSignal;
}

export interface GeminiChatResult {
  text: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

/** Build the Gemini request body from OpenAI-style messages. */
export function buildBody(opts: GeminiStreamOptions): Record<string, unknown> {
  const thinkingBudget = opts.thinkingBudget ?? 0;
  return {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: opts.messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      // Only attach thinkingConfig when a budget is actually allocated — sending
      // it with 0 is wasteful and some models reject an empty config outright.
      ...(thinkingBudget > 0
        ? { thinkingConfig: { thinkingBudget } }
        : {}),
    },
  };
}

function keyHeader(apiKey: string): Record<string, string> {
  return { "x-goog-api-key": apiKey, "content-type": "application/json" };
}

/** Pull every text delta out of one parsed SSE frame (may hold several parts). */
function frameText(json: Record<string, unknown>): string {
  const candidates = Array.isArray(json.candidates) ? (json.candidates as Record<string, unknown>[]) : [];
  let out = "";
  for (const cand of candidates) {
    const content = cand.content as { parts?: Array<{ text?: string }> } | undefined;
    for (const part of content?.parts ?? []) {
      if (typeof part.text === "string") out += part.text;
    }
  }
  return out;
}

/** Parse a buffered SSE stream into JSON frames. */
function* sseFrames(buffer: string): Generator<Record<string, unknown>, void, unknown> {
  const chunks = buffer.split("\n\n");
  // The last chunk may be an incomplete frame; the caller re-buffers it.
  for (const chunk of chunks.slice(0, -1)) {
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      const payload = line.slice("data: ".length).trim();
      if (!payload) continue;
      try {
        yield JSON.parse(payload) as Record<string, unknown>;
      } catch {
        /* skip malformed frame */
      }
    }
  }
}

/**
 * Stream a Gemini completion, yielding text deltas as they arrive.
 * Throws on non-2xx or an aborted request (AbortError propagates to the caller).
 */
export async function* streamGemini(opts: GeminiStreamOptions): AsyncGenerator<string, void, unknown> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: "POST",
    headers: keyHeader(opts.apiKey),
    body: JSON.stringify(buildBody(opts)),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw new Error(`Gemini ${res.status}: ${detail || "request failed"}`);
  }
  if (!res.body) throw new Error("Gemini returned an empty body");

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
export async function geminiChat(opts: GeminiStreamOptions): Promise<GeminiChatResult> {
  const url = `${GEMINI_BASE}/${encodeURIComponent(opts.model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: keyHeader(opts.apiKey),
    body: JSON.stringify(buildBody(opts)),
    signal: opts.signal,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw new Error(`Gemini ${res.status}: ${detail || "request failed"}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return {
    text,
    finishReason: cand?.finishReason,
    usage: json.usageMetadata
      ? {
          promptTokens: json.usageMetadata.promptTokenCount,
          completionTokens: json.usageMetadata.candidatesTokenCount,
        }
      : undefined,
  };
}
