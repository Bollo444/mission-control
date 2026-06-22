import crypto from "node:crypto";

/*
  Anthropic <-> OpenAI translation for the /api/anthropic/v1 bridge.

  Pure functions, fully unit-testable. No I/O, no fetch here.
  Claude Code (and any Anthropic SDK surface) sends POST /v1/messages in
  Anthropic shape; this translates to OpenAI chat/completions shape for
  cascadeChat, and translates the response back including full SSE re-encoding.

  Key invariants (from the claude-flow-proxy skill):
  - tool_use_id round-trips unchanged across turns
  - system prompt: top-level field → first system message (never echoed into assistant)
  - cache_control stripped silently (never 400)
  - anthropic-version/anthropic-beta accepted, never rejected
  - streaming: message_start → content_block_start → text_delta/input_json_delta →
    content_block_stop → message_delta → message_stop
  - stop_reason mapped to one of: end_turn | max_tokens | stop_sequence | tool_use
  - usage always has all 4 token fields (synthesize missing ones to 0)
  - errors always in Anthropic shape {type:"error", error:{type,message}}
*/

/* ------------------------------------------------------------------ types -- */

type AnyObj = Record<string, unknown>;

export type Slot = "haiku" | "sonnet" | "opus";

/** Map a Claude model string to one of the 3 slots. */
export function parseSlot(model: string | undefined | null): Slot {
  const m = (model ?? "").toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("opus")) return "opus";
  return "sonnet"; // covers "sonnet", "sonnet[1m]", "", null, unknown
}

export interface AnthropicError {
  type: "error";
  error: { type: string; message: string };
}

/** Build an Anthropic-shaped error response. */
export function makeAnthropicError(
  status: number,
  message: string
): { status: number; body: AnthropicError } {
  const type =
    status === 401
      ? "authentication_error"
      : status === 403
        ? "permission_error"
        : status === 404
          ? "not_found_error"
          : status === 429
            ? "rate_limit_error"
            : status === 529
              ? "overloaded_error"
              : status >= 500
                ? "api_error"
                : "invalid_request_error";
  return { status, body: { type: "error", error: { type, message } } };
}

/* -------------------------------------------------------- request (Anth→OAI) -- */

/**
 * Convert an Anthropic /v1/messages request into an OpenAI /v1/chat/completions body.
 * Strips cache_control, maps system block → system message, content blocks →
 * parts/messages, tools → functions, tool_choice → tool_choice.
 */
export function anthropicToOpenAI(req: AnyObj): AnyObj {
  const out: AnyObj = { stream: req.stream === true };
  if (typeof req.max_tokens === "number") out.max_tokens = req.max_tokens;
  if (typeof req.temperature === "number") out.temperature = req.temperature;
  if (typeof req.top_p === "number") out.top_p = req.top_p;
  if (Array.isArray(req.stop_sequences)) out.stop = req.stop_sequences;

  const messages: AnyObj[] = [];

  // System: Anthropic takes it top-level (string OR [{type:"text",text}]).
  // OpenAI wants it as the first {role:"system"} message. Strip cache_control.
  if (req.system != null) {
    const sysText =
      typeof req.system === "string"
        ? req.system
        : ((req.system as AnyObj[]).filter((b) => b.type === "text").map((b) => b.text) as string[]).join("\n\n");
    if (sysText) messages.push({ role: "system", content: sysText });
  }

  // Messages: translate each turn's content blocks.
  for (const m of (req.messages as AnyObj[]) ?? []) {
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = m.content;

    // Simple string content — pass through.
    if (typeof content === "string") {
      messages.push({ role, content });
      continue;
    }

    // Array of content blocks.
    if (role === "assistant") {
      // Assistant: text blocks → content string, tool_use → tool_calls.
      const textParts: string[] = [];
      const toolCalls: AnyObj[] = [];
      for (const b of content as AnyObj[]) {
        if (b.type === "text") {
          textParts.push(b.text as string);
        } else if (b.type === "tool_use") {
          toolCalls.push({
            id: b.id,
            type: "function",
            function: {
              name: b.name,
              arguments: JSON.stringify(b.input ?? {}),
            },
          });
        }
      }
      const msg: AnyObj = { role };
      if (textParts.length) msg.content = textParts.join("");
      if (toolCalls.length) msg.tool_calls = toolCalls;
      messages.push(msg);
    } else {
      // User: text + image + tool_result blocks.
      const parts: AnyObj[] = [];
      const toolResults: AnyObj[] = [];
      for (const b of content as AnyObj[]) {
        if (b.type === "text") {
          parts.push({ type: "text", text: b.text });
        } else if (b.type === "image") {
          const src = (b.source ?? {}) as AnyObj;
          const url = src.data
            ? `data:${src.media_type ?? "image/png"};base64,${src.data}`
            : "";
          parts.push({ type: "image_url", image_url: { url } });
        } else if (b.type === "tool_result") {
          const c = b.content;
          const text =
            typeof c === "string"
              ? c
              : Array.isArray(c)
                ? ((c as AnyObj[])
                    .filter((x) => x.type === "text")
                    .map((x) => x.text) as string[])
                    .join("")
                : "";
          toolResults.push({
            role: "tool",
            tool_call_id: b.tool_use_id,
            content: text,
          });
        }
      }
      // tool_results go as separate {role:"tool"} messages (OpenAI convention).
      if (toolResults.length) messages.push(...toolResults);
      if (parts.length) {
        messages.push({
          role,
          content:
            parts.length === 1 && parts[0].type === "text"
              ? parts[0].text
              : parts,
        });
      }
    }
  }

  out.messages = messages;

  // Tools: Anthropic tools[] → OpenAI functions[].
  if (Array.isArray(req.tools) && req.tools.length) {
    out.tools = (req.tools as AnyObj[]).map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema ?? { type: "object", properties: {} },
      },
    }));
  }

  // Tool choice mapping.
  if (req.tool_choice) {
    const tc = req.tool_choice as AnyObj;
    if (tc.type === "any") out.tool_choice = "required";
    else if (tc.type === "auto") out.tool_choice = "auto";
    else if (tc.type === "tool")
      out.tool_choice = { type: "function", function: { name: tc.name } };
    else if (tc.type === "none") out.tool_choice = "none";
  }

  return out;
}

/* ------------------------------------------------------- response (OAI→Anth) -- */

const STOP_MAP: Record<string, string> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  function_call: "tool_use",
  finish_reason: "end_turn", // some providers use this
};

/**
 * Convert an OpenAI chat completion JSON into an Anthropic /v1/messages response.
 * Covers both text-only and tool-call responses. Usage fields synthesized to 0
 * if the provider doesn't report them.
 */
export function openAIToAnthropic(
  openai: AnyObj,
  requestedModel: string
): AnyObj {
  const choice = ((openai.choices as AnyObj[]) ?? [])[0] ?? ({} as AnyObj);
  const msg = (choice.message ?? {}) as AnyObj;
  const finish = String(choice.finish_reason ?? "stop");
  const stopReason = STOP_MAP[finish] ?? "end_turn";

  const content: AnyObj[] = [];
  if (typeof msg.content === "string" && msg.content.length) {
    content.push({ type: "text", text: msg.content });
  }
  if (Array.isArray(msg.tool_calls)) {
    for (const raw of msg.tool_calls as AnyObj[]) {
      const tc = raw as AnyObj;
      const fn = (tc.function ?? {}) as AnyObj;
      let input: unknown = {};
      try {
        input = JSON.parse(String(fn.arguments ?? "{}"));
      } catch {
        input = {};
      }
      content.push({
        type: "tool_use",
        id: String(tc.id ?? `toolu_${crypto.randomBytes(12).toString("hex")}`),
        name: String(fn.name ?? ""),
        input,
      });
    }
  }

  const u = (openai.usage ?? {}) as AnyObj;
  return {
    id: `msg_${crypto.randomBytes(12).toString("hex")}`,
    type: "message",
    role: "assistant",
    content: content.length ? content : [{ type: "text", text: "" }],
    model: requestedModel,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: Number(u.prompt_tokens ?? 0),
      output_tokens: Number(u.completion_tokens ?? 0),
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

/* --------------------------------------------------------- SSE re-encoder -- */

/** Emit one SSE event line. */
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Re-encode an OpenAI streaming response as an Anthropic SSE event stream.
 *
 * Handles the exact Anthropic event grammar:
 *   message_start → content_block_start (text) → text_delta* → content_block_stop
 *   → [content_block_start (tool_use) → input_json_delta* → content_block_stop]*
 *   → message_delta → message_stop
 *
 * OpenAI streams delta.content (text tokens) and delta.tool_calls (argument fragments).
 * Each tool_calls fragment may carry an id (first chunk) or arguments string (subsequent).
 */
export function streamAdapter(
  upstreamBody: ReadableStream<Uint8Array>,
  requestedModel: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buf = "";
  let textBlockOpen = false;
  let toolBlockOpen = false;
  let outputTokens = 0;
  const msgId = `msg_${crypto.randomBytes(12).toString("hex")}`;

  return new ReadableStream({
    async start(controller) {
      // message_start immediately so the client can allocate the envelope.
      controller.enqueue(
        encoder.encode(
          sse("message_start", {
            type: "message_start",
            message: {
              id: msgId,
              type: "message",
              role: "assistant",
              content: [],
              model: requestedModel,
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          })
        )
      );

      const reader = upstreamBody.getReader();
      let stopped = false;

      const finish = (stopReason: string) => {
        if (textBlockOpen) {
          controller.enqueue(
            encoder.encode(
              sse("content_block_stop", { type: "content_block_stop", index: 0 })
            )
          );
        }
        if (toolBlockOpen) {
          controller.enqueue(
            encoder.encode(
              sse("content_block_stop", {
                type: "content_block_stop",
                index: textBlockOpen ? 1 : 0,
              })
            )
          );
        }
        controller.enqueue(
          encoder.encode(
            sse("message_delta", {
              type: "message_delta",
              delta: { stop_reason: stopReason, stop_sequence: null },
              usage: { output_tokens: outputTokens },
            })
          )
        );
        controller.enqueue(
          encoder.encode(sse("message_stop", { type: "message_stop" }))
        );
        controller.close();
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") {
              if (!stopped) {
                stopped = true;
                finish("end_turn");
              }
              continue;
            }

            let json: AnyObj;
            try {
              json = JSON.parse(payload);
            } catch {
              continue;
            }

            const choice = ((json.choices as AnyObj[]) ?? [])[0];
            if (!choice) continue;
            const delta = (choice.delta ?? {}) as AnyObj;

            // Text delta from OpenAI → Anthropic text_delta.
            if (typeof delta.content === "string" && delta.content) {
              if (!textBlockOpen) {
                textBlockOpen = true;
                controller.enqueue(
                  encoder.encode(
                    sse("content_block_start", {
                      type: "content_block_start",
                      index: 0,
                      content_block: { type: "text", text: "" },
                    })
                  )
                );
              }
              outputTokens += 1;
              controller.enqueue(
                encoder.encode(
                  sse("content_block_delta", {
                    type: "content_block_delta",
                    index: 0,
                    delta: { type: "text_delta", text: delta.content },
                  })
                )
              );
            }

            // Tool call deltas from OpenAI → Anthropic input_json_delta.
            if (Array.isArray(delta.tool_calls)) {
              for (const raw of delta.tool_calls as AnyObj[]) {
                const tc = raw as AnyObj;
                const fn = (tc.function ?? {}) as AnyObj;
                // First chunk carries the id — open a new tool_use block.
                if (tc.id && !toolBlockOpen) {
                  toolBlockOpen = true;
                  controller.enqueue(
                    encoder.encode(
                      sse("content_block_start", {
                        type: "content_block_start",
                        index: textBlockOpen ? 1 : 0,
                        content_block: {
                          type: "tool_use",
                          id: tc.id,
                          name: fn.name ?? "",
                          input: {},
                        },
                      })
                    )
                  );
                }
                // Subsequent chunks carry argument fragments.
                const frag = fn.arguments;
                if (typeof frag === "string" && frag) {
                  outputTokens += 1;
                  controller.enqueue(
                    encoder.encode(
                      sse("content_block_delta", {
                        type: "content_block_delta",
                        index: textBlockOpen ? 1 : 0,
                        delta: { type: "input_json_delta", partial_json: frag },
                      })
                    )
                  );
                }
              }
            }

            // finish_reason signals the stream is ending.
            if (choice.finish_reason && !stopped) {
              stopped = true;
              finish(STOP_MAP[String(choice.finish_reason)] ?? "end_turn");
            }
          }
        }
      } catch {
        if (!stopped) {
          stopped = true;
          finish("end_turn");
        }
      }

      // Safety: ensure finish runs if the loop exits without [DONE].
      if (!stopped) finish("end_turn");
    },
  });
}
