import crypto from "node:crypto";

/* ------------------------------------------------------------------ *
 * OpenAI Responses API ⇄ Chat Completions bridge — lets Codex (which   *
 * now requires wire_api="responses") run on the chat-completions       *
 * cascade gateway. We translate the request to chat, get a full reply, *
 * then emit a synthetic Responses SSE stream Codex can consume.        *
 * ------------------------------------------------------------------ */

type AnyObj = Record<string, unknown>;

/** Pull plain text out of a Responses content field (string or part array). */
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        const o = p as AnyObj;
        if (typeof o?.text === "string") return o.text;
        return "";
      })
      .join("");
  }
  return "";
}

/** Translate a Responses request body into a Chat Completions body. */
export function responsesToChat(body: AnyObj): AnyObj {
  const messages: AnyObj[] = [];
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    messages.push({ role: "system", content: body.instructions });
  }
  const input = body.input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const raw of input) {
      const item = raw as AnyObj;
      // Assistant's prior tool call — without this the loop history is broken.
      if (item.type === "function_call") {
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{ id: String(item.call_id ?? item.id ?? ""), type: "function", function: { name: String(item.name ?? ""), arguments: String(item.arguments ?? "{}") } }],
        });
        continue;
      }
      if (item.type === "function_call_output") {
        messages.push({ role: "tool", tool_call_id: String(item.call_id ?? ""), content: textOf(item.output) });
        continue;
      }
      if (item.type === "reasoning") continue; // not representable in chat
      // OpenAI's Responses API uses "developer" for system-level instructions;
      // chat-completions providers only know system/user/assistant/tool.
      let role = String(item.role ?? "user");
      if (role === "developer") role = "system";
      else if (!["system", "user", "assistant", "tool"].includes(role)) role = "user";
      const text = textOf(item.content);
      if (text) messages.push({ role, content: text });
    }
  }

  const out: AnyObj = { model: body.model ?? "auto", messages, stream: false };
  if (typeof body.temperature === "number") out.temperature = body.temperature;
  if (typeof body.max_output_tokens === "number") out.max_tokens = body.max_output_tokens;
  // Forward tools — but only well-formed function tools with a name. Codex also
  // sends built-in Responses tool types (no name) that chat-completions can't
  // take; dropping them keeps the request valid (the model just lacks that tool).
  if (Array.isArray(body.tools) && body.tools.length) {
    const fns = body.tools
      .map((t) => {
        const o = t as AnyObj;
        if (o.type === "namespace") return null; // a group of sub-tools, not callable itself
        const fn = (o.function ?? {}) as AnyObj;
        if (o.type === "function" && fn.name) return o;
        // Responses function tools are flat: { type:"function", name, parameters }.
        if (o.name) {
          return { type: "function", function: { name: o.name, description: o.description ?? "", parameters: o.parameters ?? { type: "object", properties: {} } } };
        }
        return null;
      })
      .filter(Boolean);
    if (fns.length) out.tools = fns;
  }
  return out;
}

interface ChatMessage {
  content?: string | null;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
}

/**
 * Some free models can't emit native tool_calls and instead write the call as
 * text: <function>name{json-args}</function>. Recover those so Codex's agentic
 * loop still works. Returns the extracted calls + the text with them removed.
 */
export function parseTextToolCalls(text: string): { calls: NonNullable<ChatMessage["tool_calls"]>; rest: string } {
  const calls: NonNullable<ChatMessage["tool_calls"]> = [];
  let rest = text;
  const re = /<function>\s*([a-zA-Z0-9_.-]+)\s*(\{[\s\S]*?\})\s*<\/function>/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    let args = m[2];
    try { args = JSON.stringify(JSON.parse(args)); } catch { /* keep raw */ }
    calls.push({ id: `call_txt_${i++}`, function: { name: m[1], arguments: args } });
    rest = rest.replace(m[0], "");
  }
  return { calls, rest: rest.trim() };
}

/** Extract the assistant message + usage from a chat-completions JSON response. */
export function parseChat(json: AnyObj): { text: string; toolCalls: ChatMessage["tool_calls"]; usage: AnyObj } {
  const choice = ((json.choices as AnyObj[]) ?? [])[0] ?? {};
  const msg = ((choice as AnyObj).message ?? {}) as ChatMessage;
  const native = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  let text = typeof msg.content === "string" ? msg.content : "";
  let toolCalls = native;
  // Fallback: recover text-format tool calls when the model didn't emit native ones.
  if (native.length === 0 && text.includes("<function>")) {
    const { calls, rest } = parseTextToolCalls(text);
    if (calls.length) { toolCalls = calls; text = rest; }
  }
  return { text, toolCalls, usage: (json.usage as AnyObj) ?? {} };
}

const enc = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Build a complete Responses SSE stream from a finished chat reply. Emits the
 * standard event sequence (created → output items → completed) so Codex's
 * Responses client accepts it. Text and tool/function calls both supported.
 */
export function buildResponsesSSE(opts: {
  model: string;
  text: string;
  toolCalls: ChatMessage["tool_calls"];
  usage: AnyObj;
}): string {
  const respId = `resp_${crypto.randomBytes(12).toString("hex")}`;
  const output: AnyObj[] = [];
  let out = "";
  let idx = 0;

  const base = (status: string) => ({
    id: respId,
    object: "response",
    status,
    model: opts.model,
    output,
  });

  out += enc("response.created", { type: "response.created", response: base("in_progress") });
  out += enc("response.in_progress", { type: "response.in_progress", response: base("in_progress") });

  // Tool/function calls first (agentic turns).
  for (const tc of opts.toolCalls ?? []) {
    const itemId = `fc_${crypto.randomBytes(8).toString("hex")}`;
    const args = tc.function?.arguments ?? "{}";
    const item = { type: "function_call", id: itemId, status: "completed", call_id: tc.id ?? itemId, name: tc.function?.name ?? "", arguments: args };
    out += enc("response.output_item.added", { type: "response.output_item.added", output_index: idx, item: { ...item, status: "in_progress", arguments: "" } });
    out += enc("response.function_call_arguments.delta", { type: "response.function_call_arguments.delta", item_id: itemId, output_index: idx, delta: args });
    out += enc("response.function_call_arguments.done", { type: "response.function_call_arguments.done", item_id: itemId, output_index: idx, arguments: args });
    out += enc("response.output_item.done", { type: "response.output_item.done", output_index: idx, item });
    output.push(item);
    idx++;
  }

  // Assistant text.
  if (opts.text) {
    const msgId = `msg_${crypto.randomBytes(8).toString("hex")}`;
    out += enc("response.output_item.added", { type: "response.output_item.added", output_index: idx, item: { type: "message", id: msgId, status: "in_progress", role: "assistant", content: [] } });
    out += enc("response.content_part.added", { type: "response.content_part.added", item_id: msgId, output_index: idx, content_index: 0, part: { type: "output_text", text: "", annotations: [] } });
    out += enc("response.output_text.delta", { type: "response.output_text.delta", item_id: msgId, output_index: idx, content_index: 0, delta: opts.text });
    out += enc("response.output_text.done", { type: "response.output_text.done", item_id: msgId, output_index: idx, content_index: 0, text: opts.text });
    out += enc("response.content_part.done", { type: "response.content_part.done", item_id: msgId, output_index: idx, content_index: 0, part: { type: "output_text", text: opts.text, annotations: [] } });
    const item = { type: "message", id: msgId, status: "completed", role: "assistant", content: [{ type: "output_text", text: opts.text, annotations: [] }] };
    out += enc("response.output_item.done", { type: "response.output_item.done", output_index: idx, item });
    output.push(item);
    idx++;
  }

  const usage = {
    input_tokens: Number(opts.usage.prompt_tokens ?? 0),
    output_tokens: Number(opts.usage.completion_tokens ?? 0),
    total_tokens: Number(opts.usage.total_tokens ?? 0),
  };
  out += enc("response.completed", { type: "response.completed", response: { ...base("completed"), usage } });
  return out;
}
