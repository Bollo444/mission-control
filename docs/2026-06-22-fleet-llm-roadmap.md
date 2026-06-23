# Fleet LLM Roadmap — Live-LLM Meeting + Claude Anthropic Bridge (3-Slot Router)

> **For agentic workers / future sessions:** This is a durable, resumable blueprint. Each task has a checkbox (`- [ ]`). Update the box to `- [x]` as you complete it. Every task lists exact files, exact code, and exact verification commands, so you can pick up at any step after an interruption. Read **"How to resume"** (bottom) before starting.

**Goal:** Two independent pieces of work, in order. (A) Replace the team meeting's hardcoded template personas with live LLM calls through the existing provider cascade. (B) Add an Anthropic `/v1/messages` endpoint inside Mission Control backed by a 3-slot model router (haiku/sonnet/opus), so Claude Code keeps speaking Anthropic format while being routable to any provider/model from the dashboard.

**Architecture:**
- Part A reuses `cascadeChat()` from `lib/gateway.ts` — each meeting turn becomes one LLM call with the agent's persona as system prompt and the live fleet metrics as context.
- Part B adds `app/api/anthropic/[...path]/route.ts` (mirrors the existing `app/api/route/openrouter/[...path]/route.ts` cascade proxy) plus a translator module `lib/anthropic-bridge.ts`. Claude's model string (`sonnet[1m]`, `opus`, `haiku`) maps to a slot, and the slot's `{provider, model}` is injected into the translated OpenAI request before `cascadeChat()`.

**Tech Stack:** Next.js 15 (App Router, route handlers), TypeScript, the existing `lib/settings.ts` + `lib/gateway.ts` + `lib/logbook.ts`. No new dependencies.

**Repository:** `C:\Users\Amari\mission-control` (pm2 process `mission-control`, port `4317`). It is a git repo — commit after each task.

---

## Pre-flight: snapshot the starting state

- [ ] **P1. Confirm clean working tree** (so interruption recovery is unambiguous)

```bash
cd ~/mission-control
git status
git log --oneline -5
```
Expected: `working tree clean` (or note any pre-existing dirty state in the resume log at the bottom of this file). If dirty, commit or stash before starting.

- [ ] **P2. Confirm the app builds and pm2 is up**

```bash
cd ~/mission-control
npm run build 2>&1 | tail -20
pm2 list | grep mission-control
```
Expected: build succeeds; pm2 shows `mission-control` as `online`. This is your "known-good" baseline.

---

# PART A — Team Meeting: live LLM calls

## Why
`lib/meeting.ts` is 679 lines of deterministic templates. Its own header (lines 12-19) says *"There is no cloud model in the loop."* Every agent turn is a hardcoded `PERSONAS[id].status/respond/concern` function with live metrics interpolated + `pick([...])` randomness. The goal: make each turn a real LLM call routed through the agent's configured provider, with the persona as system prompt and the live fleet report as context. Keep the templated path as a **fallback** so the meeting never breaks if a provider is rate-limited or keys are missing.

## File structure (Part A)
| File | Responsibility |
|---|---|
| `lib/meeting.ts` (modify) | Replace `PERSONAS[id].status/respond/concern` call sites with `generateTurnLLM()`; keep templates as fallback. |
| `lib/meeting-llm.ts` (NEW) | `generateTurnLLM(agentId, phase, ctx): Promise<string>` — builds persona system prompt + fleet context, calls `cascadeChat`, returns prose. Pure async, testable. |
| `app/api/meeting/route.ts` (modify) | Make it `async`; await the LLM-backed turn generation. |

## Task A1: Create the LLM turn generator

**Files:**
- Create: `lib/meeting-llm.ts`

- [ ] **A1.1 Write the generator module**

```typescript
// lib/meeting-llm.ts
import { readSettings } from "./settings";
import { getAgentBehavior } from "./memory";
import { cascadeChat } from "./gateway";
import { logEvent } from "./logbook";
import type { MeetingPhase } from "./types";
import type { LiveContext } from "./meeting"; // the metrics object meeting.ts already builds

/**
 * Produce one agent turn via a live LLM call, routed through that agent's
 * configured provider/model in settings. Returns null on any failure so the
 * caller can fall back to the templated persona.
 */
export async function generateTurnLLM(
  agentId: string,
  name: string,
  role: string,
  lens: string | undefined,
  phase: MeetingPhase,
  ctx: LiveContext
): Promise<string | null> {
  const settings = readSettings();
  const route = settings.routingPreferred[agentId] ?? settings.routing[agentId];
  if (!route) return null;

  const behavior = getAgentBehavior(agentId);
  const personaRole = behavior.role || role;
  const personaLens = behavior.lens || lens || "system health";

  const system = [
    `You are ${name}, the ${personaRole} of a fleet of coding agents.`,
    `You see the system through the lens of: ${personaLens}.`,
    "You are in a brief stand-up meeting with the rest of the fleet.",
    "Speak in FIRST PERSON, in 1-3 short sentences. Stay in character.",
    "Be specific about the numbers. Do not invent tools or agents that aren't in the context.",
    phase === "open" ? "You are opening the meeting with a status readout."
      : phase === "concern" ? "You are raising the single most important concern right now."
      : "You are closing out with a concrete next action.",
  ].join(" ");

  const user = `Live fleet context (JSON):\n${JSON.stringify(ctx)}\n\nYour turn (phase: ${phase}).`;

  try {
    const text = await cascadeChat({
      route,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      maxTokens: 160,
    });
    return text?.trim() || null;
  } catch (err) {
    logEvent({
      source: "meeting",
      level: "warn",
      event: "llm turn failed, falling back to template",
      detail: `${agentId}/${phase}: ${(err as Error).message?.slice(0, 120)}`,
    });
    return null;
  }
}
```

> **VERIFY the exact signature of `cascadeChat` before writing this file.** Run `grep -nA20 "export.*function cascadeChat\|export async function cascadeChat" lib/gateway.ts`. The object shape above (`{route, messages, temperature, maxTokens}`) is a guess based on the OpenAI-shaped cascade; adapt the field names to match the real signature. Do the same for `LiveContext` — `grep -n "LiveContext\|interface.*Context" lib/meeting.ts`.

- [ ] **A1.2 Typecheck the new file in isolation**

```bash
cd ~/mission-control
npx tsc --noEmit lib/meeting-llm.ts 2>&1 | head
```
Expected: no errors (or only errors about types imported from modules — fix the field-name mismatches surfaced here before proceeding).

---

## Task A2: Wire the generator into the meeting engine

**Files:**
- Modify: `lib/meeting.ts` (the `status`/`respond`/`concern`/`suggestion` call sites in `buildMeeting` and `replyToMessage`)
- Modify: `app/api/meeting/route.ts` (make `async`)

- [ ] **A2.1 Locate the turn-generation call sites**

```bash
cd ~/mission-control
grep -nE "\.status\(|\.respond\(|\.concern\(|\.suggestion\(|PERSONAS\[" lib/meeting.ts
```
Note each line number — these are the spots to replace. There will be several (open/concern/close phases × roster).

- [ ] **A2.2 Make `buildMeeting` and `replyToMessage` async, await the LLM call with template fallback**

For each call site, wrap it:
```typescript
// before
const text = PERSONAS[id].status(ctx);
// after
const text = (await generateTurnLLM(id, name, role, lens, "open", ctx))
  ?? PERSONAS[id].status(ctx);   // keep template as guaranteed fallback
```
Add `import { generateTurnLLM } from "./meeting-llm";` at the top. Change `export function buildMeeting(...)` → `export async function buildMeeting(...)` and likewise `replyToMessage`. Adjust the phase argument per site (`"open" | "concern" | "close" | "reply"`).

- [ ] **A2.3 Make the route handler await it**

```typescript
// app/api/meeting/route.ts
export async function GET() {
  const resp = await buildMeeting(/* existing args */);
  return Response.json(resp);
}
```
Same for the `reply`/`POST` path. Verify the exact current handler shape first: `cat app/api/meeting/route.ts`.

- [ ] **A2.4 Build + typecheck**

```bash
cd ~/mission-control
npm run build 2>&1 | tail -20
```
Expected: build succeeds. Fix any `await in non-async` or signature errors.

---

## Task A3: Verify Part A end-to-end

- [ ] **A3.1 Reload the app and hit the meeting endpoint**

```bash
cd ~/mission-control
pm2 reload mission-control
sleep 3
curl -s http://127.0.0.1:4317/api/meeting | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('turns:',j.turns.length);j.turns.slice(0,3).forEach(t=>console.log(' -',t.agentId+':',t.text.slice(0,90)))})"
```
Expected: turns come back. If any provider is rate-limited, those turns still render (template fallback) — check logs: `grep "llm turn failed" ~/.mission-control/events.log`.

- [ ] **A3.2 Commit Part A**

```bash
cd ~/mission-control
git add lib/meeting.ts lib/meeting-llm.ts app/api/meeting/route.ts
git commit -m "feat(meeting): route agent turns through live LLM cascade with template fallback"
```

---

# PART B — Claude Anthropic Bridge + 3-Slot Router

## Why
Mission Control already has a Fleet Gateway that speaks **OpenAI** shape (`/api/gateway/v1/chat/completions`, used by OpenCode etc.). It has **no** Anthropic `/v1/messages` endpoint, so Claude Code (which only speaks Anthropic) cannot flow through the fleet. Part B adds that endpoint as a thin translator that calls the *same* `cascadeChat()`, plus a 3-slot router (haiku/sonnet/opus) configurable from the Settings page so you never edit `settings.json` again.

## File structure (Part B)
| File | Responsibility |
|---|---|
| `lib/anthropic-bridge.ts` (NEW) | Pure translators: `anthropicToOpenAI`, `openAIToAnthropic`, `streamAdapter`, `parseSlot`, `makeAnthropicError`. No I/O. |
| `lib/anthropic-bridge.test.ts` (NEW) | Round-trip + SSE-grammar unit tests. |
| `app/api/anthropic/[...path]/route.ts` (NEW) | `/v1/messages` (+ `/v1/models`) endpoint; mirrors the OpenRouter cascade route. |
| `lib/settings.ts` (modify) | Add `anthropicSlots` field + defaults + persist + expose in `publicSettings`. |
| `app/api/settings/route.ts` (modify) | Accept `anthropicSlots` in POST body. |
| `app/settings/page.tsx` (modify) | New "Claude Code · Anthropic slots" UI section. |
| `~/.claude/settings.json` (modify) | Repoint Claude Code to the bridge (backed up first). |

## Task B1: The translator module

**Files:**
- Create: `lib/anthropic-bridge.ts`

- [ ] **B1.1 Write `parseSlot` + error factory + stop-reason map**

```typescript
// lib/anthropic-bridge.ts
export type Slot = "haiku" | "sonnet" | "opus";
export const SLOTS: Slot[] = ["haiku", "sonnet", "opus"];

/** Map a Claude-style model string to one of the 3 router slots. */
export function parseSlot(model: string | undefined): Slot {
  const m = (model ?? "").toLowerCase();
  if (m.includes("haiku")) return "haiku";
  if (m.includes("opus")) return "opus";
  return "sonnet"; // default: sonnet, sonnet[1m], default fallback, unknown
}

const STOP_MAP: Record<string, string> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  function_call: "tool_use",
};
export function mapStopReason(r: string | undefined | null): string {
  return STOP_MAP[r ?? ""] ?? "end_turn";
}

export function makeAnthropicError(
  status: number,
  type: string,
  message: string
) {
  return Response.json(
    { type: "error", error: { type, message } },
    { status }
  );
}
```

- [ ] **B1.2 Write `anthropicToOpenAI` (request translation)**

```typescript
interface AnthropicContent {
  type: string;
  text?: string;
  source?: { type: string; media_type: string; data: string };
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  cache_control?: unknown;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContent[];
}

export interface OpenAIMsg { role: string; content?: string | null; tool_calls?: any[]; tool_call_id?: string; name?: string }

export function anthropicToOpenAI(req: {
  system?: string | { type: string; text: string; cache_control?: unknown }[];
  messages: AnthropicMessage[];
  tools?: any[];
  tool_choice?: any;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}): { messages: OpenAIMsg[]; functions?: any; tool_choice?: any; max_tokens?: number; temperature?: number; top_p?: number; stop?: string[] } {
  const out: OpenAIMsg[] = [];
  // System prompt → first system message (strip cache_control).
  if (req.system) {
    const sys = typeof req.system === "string"
      ? req.system
      : req.system.filter(b => b.type === "text").map(b => b.text).join("\n");
    if (sys) out.push({ role: "system", content: sys });
  }
  for (const m of req.messages) {
    const blocks = Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }];
    if (m.role === "assistant") {
      let text = "";
      const tool_calls: any[] = [];
      let i = 0;
      for (const b of blocks as AnthropicContent[]) {
        if (b.type === "text" && b.text) text += b.text;
        else if (b.type === "tool_use") {
          tool_calls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
          i++;
        }
      }
      out.push({ role: "assistant", content: text || null, tool_calls: tool_calls.length ? tool_calls : undefined });
    } else {
      // user turn: text + tool_result blocks. tool_result becomes a separate "tool" message.
      const textParts: string[] = [];
      const results: any[] = [];
      for (const b of blocks as AnthropicContent[]) {
        if (b.type === "text" && b.text) textParts.push(b.text);
        else if (b.type === "tool_result") {
          const c = b.content;
          const txt = typeof c === "string" ? c : Array.isArray(c) ? c.filter((x:any)=>x.type==="text").map((x:any)=>x.text).join("") : JSON.stringify(c);
          results.push({ role: "tool", tool_call_id: b.tool_use_id, content: txt });
        }
      }
      if (textParts.length) out.push({ role: "user", content: textParts.join("") });
      out.push(...results);
    }
  }
  const functions = req.tools?.map((t:any) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema ?? {} },
  }));
  return {
    messages: out,
    functions,
    tool_choice: req.tool_choice ? mapToolChoice(req.tool_choice) : undefined,
    max_tokens: req.max_tokens,
    temperature: req.temperature,
    top_p: req.top_p,
    stop: req.stop_sequences,
  };
}

function mapToolChoice(tc: any): any {
  if (tc?.type === "any" || tc?.type === "auto") return tc.type;
  if (tc?.type === "tool") return { type: "function", function: { name: tc.name } };
  return "auto";
}
```

- [ ] **B1.3 Write `openAIToAnthropic` (non-streaming response)**

```typescript
export function openAIToAnthropic(resp: any, requestedModel: string) {
  const choice = resp?.choices?.[0] ?? {};
  const msg = choice.message ?? {};
  const content: any[] = [];
  if (msg.content) content.push({ type: "text", text: msg.content });
  for (const tc of msg.tool_calls ?? []) {
    let input: any = {};
    try { input = JSON.parse(tc.function?.arguments ?? "{}"); } catch {}
    content.push({ type: "tool_use", id: tc.id, name: tc.function?.name, input });
  }
  const usage = resp?.usage ?? {};
  return {
    id: resp?.id ?? ("msg_" + Math.random().toString(36).slice(2)),
    type: "message",
    role: "assistant",
    model: requestedModel,
    content: content.length ? content : [{ type: "text", text: "" }],
    stop_reason: mapStopReason(choice.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens ?? 0,
      output_tokens: usage.completion_tokens ?? 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}
```

- [ ] **B1.4 Write `streamAdapter` (the SSE re-encoder — hardest part)**

This consumes OpenAI SSE chunks and re-emits the exact Anthropic event sequence. It's a generator that yields full SSE-formatted `event:`/`data:` strings.

```typescript
export async function* streamAdapter(
  upstream: AsyncIterable<any>,   // OpenAI SSE chunks, already parsed to JSON
  requestedModel: string,
  inputTokens: number
): AsyncGenerator<string> {
  const msgId = "msg_" + Math.random().toString(36).slice(2);
  // message_start
  yield sse("message_start", { type: "message_start", message: {
    id: msgId, type: "message", role: "assistant", content: [], model: requestedModel,
    stop_reason: null, stop_sequence: null,
    usage: { input_tokens: inputTokens, output_tokens: 0 },
  }});

  let blockIdx = 0;
  let textOpen = false;
  const toolBlocks: Record<number, { id: string; name: string; buf: string }> = {};
  let outputTokens = 0;
  let stopReason = "end_turn";

  for await (const chunk of upstream) {
    const delta = chunk?.choices?.[0]?.delta ?? {};
    const finish = chunk?.choices?.[0]?.finish_reason;

    if (typeof delta.content === "string" && delta.content) {
      if (!textOpen) { yield sse("content_block_start", { type: "content_block_start", index: blockIdx, content_block: { type: "text", text: "" } }); textOpen = true; }
      outputTokens += Math.ceil(delta.content.length / 4);
      yield sse("content_block_delta", { type: "content_block_delta", index: blockIdx, delta: { type: "text_delta", text: delta.content } });
    }
    for (const tc of delta.tool_calls ?? []) {
      const idx = tc.index ?? 0;
      if (!toolBlocks[idx]) {
        if (textOpen) { yield sse("content_block_stop", { type: "content_block_stop", index: blockIdx }); blockIdx++; textOpen = false; }
        const id = tc.id ?? ("toolu_" + Math.random().toString(36).slice(2));
        toolBlocks[idx] = { id, name: tc.function?.name ?? "", buf: "" };
        yield sse("content_block_start", { type: "content_block_start", index: blockIdx + idx, content_block: { type: "tool_use", id, name: toolBlocks[idx].name, input: {} } });
      }
      const frag = tc.function?.arguments ?? "";
      if (frag) { toolBlocks[idx].buf += frag; yield sse("content_block_delta", { type: "content_block_delta", index: blockIdx + idx, delta: { type: "input_json_delta", partial_json: frag } }); }
    }
    if (finish) stopReason = mapStopReason(finish);
  }

  if (textOpen) yield sse("content_block_stop", { type: "content_block_stop", index: blockIdx });
  for (const k of Object.keys(toolBlocks)) yield sse("content_block_stop", { type: "content_block_stop", index: blockIdx + Number(k) });
  yield sse("message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } });
  yield sse("message_stop", { type: "message_stop" });
  yield sse("ping", { type: "ping" });
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

> Notes on the grammar: every event is `event: <name>\n` + `data: <json>\n\n` (two newlines terminate). Tool-call args stream as `input_json_delta` fragments that concatenate to valid JSON. `message_start` fires before the first token; the sequence always ends with `message_stop`.

---

## Task B2: Unit tests for the translator

**Files:**
- Create: `lib/anthropic-bridge.test.ts`

- [ ] **B2.1 Write the tests**

```typescript
// lib/anthropic-bridge.test.ts
import { strict as assert } from "node:assert";
import { parseSlot, mapStopReason, anthropicToOpenAI, openAIToAnthropic, streamAdapter } from "./anthropic-bridge";

// parseSlot
assert.equal(parseSlot("claude-3-5-sonnet-20241022"), "sonnet");
assert.equal(parseSlot("claude-3-5-haiku-20241022"), "haiku");
assert.equal(parseSlot("claude-3-opus"), "opus");
assert.equal(parseSlot("sonnet[1m]"), "sonnet");
assert.equal(parseSlot(undefined), "sonnet");

// stop reasons
assert.equal(mapStopReason("stop"), "end_turn");
assert.equal(mapStopReason("length"), "max_tokens");
assert.equal(mapStopReason("tool_calls"), "tool_use");
assert.equal(mapStopReason("garbage"), "end_turn");

// request: system + text + tool_use + tool_result round-trips
const t = anthropicToOpenAI({
  system: [{ type: "text", text: "You are helpful", cache_control: { type: "ephemeral" } }],
  messages: [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "toolu_1", name: "ls", input: { path: "." } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "file.txt" }] },
  ],
});
assert.equal(t.messages[0].role, "system");
assert.equal(t.messages[0].content, "You are helpful"); // cache_control stripped
assert.equal(t.messages[1].content, "hi");
assert.equal(t.messages[2].tool_calls[0].id, "toolu_1"); // id preserved
assert.equal(t.messages[3].tool_call_id, "toolu_1");     // result references it

// response: tool calls become tool_use blocks
const r = openAIToAnthropic({
  id: "x", choices: [{ finish_reason: "tool_calls", message: { content: "thinking", tool_calls: [{ id: "call_1", function: { name: "ls", arguments: '{"path":"."}' } }] } }],
  usage: { prompt_tokens: 5, completion_tokens: 3 },
}, "claude-sonnet");
assert.equal(r.stop_reason, "tool_use");
assert.equal(r.content[1].type, "tool_use");
assert.deepEqual(r.content[1].input, { path: "." });
assert.equal(r.usage.cache_read_input_tokens, 0);

// streaming: must emit message_start ... message_stop
async function* fakeUpstream() {
  yield { choices: [{ delta: { content: "Hel" } }] };
  yield { choices: [{ delta: { content: "lo" } }] };
  yield { choices: [{ finish_reason: "stop" }] };
}
const parts: string[] = [];
for await (const p of streamAdapter(fakeUpstream(), "claude-sonnet", 4)) parts.push(p);
const joined = parts.join("");
assert.ok(joined.includes("message_start"), "missing message_start");
assert.ok(joined.includes("text_delta"), "missing text_delta");
assert.ok(joined.includes('"text":"Hel"'));
assert.ok(joined.includes("message_stop"), "missing message_stop");
assert.ok(joined.includes('"stop_reason":"end_turn"'));

console.log("anthropic-bridge tests: PASS");
```

- [ ] **B2.2 Run them**

```bash
cd ~/mission-control
node --import tsx lib/anthropic-bridge.test.ts   # or: npx tsx lib/anthropic-bridge.test.ts
```
Expected: `anthropic-bridge tests: PASS`. If `tsx` isn't available, `npm i -D tsx` first, or run under the existing test harness (check `package.json` `scripts.test`). Fix failures before moving on.

---

## Task B3: Extend settings with `anthropicSlots`

**Files:**
- Modify: `lib/settings.ts` (add field, defaults, persist, expose)

- [ ] **B3.1 Add the field + type + defaults**

In `lib/settings.ts`, add to the `Settings` interface (after `routingPreferred`):
```typescript
  /** Per-slot routing for the Anthropic /v1/messages bridge (Claude Code).
   *  Claude's model selector (haiku/sonnet/opus) maps to these. */
  anthropicSlots: Record<"haiku" | "sonnet" | "opus", RouteRule>;
```

Add to `DEFAULTS` (after `routingPreferred: DEFAULT_ROUTING,`):
```typescript
  anthropicSlots: {
    haiku:  { provider: "groq",      model: "llama-3.1-8b-instant" },
    sonnet: { provider: "nim",       model: "qwen/qwen3-coder-480b-a35b-instruct" },
    opus:   { provider: "cerebras",  model: "gpt-oss-120b" },
  },
```

- [ ] **B3.2 Carry it through read/write**

In `readSettings()` return object, add:
```typescript
  anthropicSlots: { ...DEFAULTS.anthropicSlots, ...(parsed.anthropicSlots ?? {}) },
```
In `writeSettings()`, add before `merged.updatedAt`:
```typescript
  if (next.anthropicSlots) merged.anthropicSlots = { ...merged.anthropicSlots, ...next.anthropicSlots };
```
In the `changed[]` logging block:
```typescript
  if (next.anthropicSlots) changed.push(`anthropicSlots[${Object.keys(next.anthropicSlots).join(",")}]`);
```

- [ ] **B3.3 Expose to the client**

In `publicSettings()` return object add:
```typescript
  anthropicSlots: s.anthropicSlots,
```

- [ ] **B3.4 Typecheck**

```bash
cd ~/mission-control
npx tsc --noEmit
```
Expected: clean.

---

## Task B4: Persist `anthropicSlots` via the settings API

**Files:**
- Modify: `app/api/settings/route.ts`

- [ ] **B4.1 Accept the new field in POST**

First read the current file: `cat app/api/settings/route.ts`. Add `anthropicSlots` to the destructured body and pass it to `writeSettings`. Typical shape:
```typescript
const { routing, routingPreferred, apiKeys, anthropicSlots } = await req.json();
writeSettings({ routing, routingPreferred, anthropicSlots, /* apiKeys handled as before */ });
```
Validate each slot value is `{ provider, model }` with `provider` in `PROVIDERS` (throw 400 otherwise).

- [ ] **B4.2 Verify**

```bash
cd ~/mission-control
npm run build 2>&1 | tail -5
```

---

## Task B5: The endpoint (mirrors the OpenRouter cascade route)

**Files:**
- Create: `app/api/anthropic/[...path]/route.ts`

- [ ] **B5.1 First, study the pattern to mirror**

```bash
cd ~/mission-control
cat app/api/route/openrouter/[...path]/route.ts
grep -nA25 "export.*function cascadeChat\|export async function cascadeChat" lib/gateway.ts
```
Match its auth (gateway token check), its logging, and its `cascadeChat` invocation. The new route only handles `/v1/messages` (POST) and `/v1/models` (GET).

- [ ] **B5.2 Write the route**

```typescript
// app/api/anthropic/[...path]/route.ts
import { readSettings, getGatewayToken } from "@/lib/settings";
import { cascadeChat } from "@/lib/gateway";
import { logEvent } from "@/lib/logbook";
import {
  anthropicToOpenAI, openAIToAnthropic, streamAdapter, parseSlot, makeAnthropicError,
} from "@/lib/anthropic-bridge";

function authed(req: Request): boolean {
  const tok = getGatewayToken();
  const h = req.headers.get("authorization") ?? "";
  const x = req.headers.get("x-api-key") ?? "";
  return h.endsWith(tok) || x === tok || h.includes(tok);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.join("/").endsWith("messages"))
    return makeAnthropicError(404, "not_found_error", "Not found");
  if (!authed(req)) return makeAnthropicError(401, "authentication_error", "Bad token");

  const body = await req.json();
  const slot = parseSlot(body.model);
  const settings = readSettings();
  const route = settings.anthropicSlots[slot];
  if (!route?.provider) return makeAnthropicError(500, "api_error", `No model mapped to slot "${slot}"`);

  const translated = anthropicToOpenAI(body);
  logEvent({ source: "anthropic-bridge", level: "info", event: "request",
    detail: `slot=${slot} → ${route.provider}/${route.model} stream=${!!body.stream}` });

  try {
    if (body.stream) {
      // cascadeChat must expose a streaming mode returning an async iterable of OpenAI chunks.
      // Adapt the call below to cascadeChat's real streaming signature (see B5.1).
      const upstream = await cascadeChat({ route, stream: true, body: translated });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of streamAdapter(upstream, body.model, translated)) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    } else {
      const resp = await cascadeChat({ route, body: translated });
      return Response.json(openAIToAnthropic(resp, body.model));
    }
  } catch (err) {
    logEvent({ source: "anthropic-bridge", level: "error", event: "upstream failed", detail: (err as Error).message?.slice(0,200) });
    return makeAnthropicError(502, "api_error", "Upstream provider failed");
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!path.join("/").endsWith("models")) return makeAnthropicError(404, "not_found_error", "Not found");
  if (!authed(req)) return makeAnthropicError(401, "authentication_error", "Bad token");
  const slots = readSettings().anthropicSlots;
  return Response.json({
    data: [
      { id: "claude-haiku-4-5", display_name: "Haiku slot → " + slots.haiku.provider + "/" + slots.haiku.model },
      { id: "claude-sonnet-4-5", display_name: "Sonnet slot → " + slots.sonnet.provider + "/" + slots.sonnet.model },
      { id: "claude-opus-4-5", display_name: "Opus slot → " + slots.opus.provider + "/" + slots.opus.model },
    ],
  });
}
```

> **The `cascadeChat` call shape above is a best guess.** Step B5.1 is mandatory — read the real signature and adapt `{route, body}` / `{route, stream, body}` to match. If `cascadeChat` doesn't expose streaming, see B7 fallback.

- [ ] **B5.3 Build**

```bash
cd ~/mission-control
npm run build 2>&1 | tail -20
```
Fix type errors (especially around `cascadeChat` arg shape and the `params` Promise — Next 15 makes route params a Promise).

---

## Task B6: The 3-slot router UI

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **B6.1 Add state for the slots**

Near the existing `const [routing, setRouting] = useState(...)` add:
```typescript
const [slots, setSlots] = useState(settings.anthropicSlots);
```
(where `settings.anthropicSlots` comes from the existing `publicSettings` fetch the page already does).

- [ ] **B6.2 Add the save payload**

In the existing `save()` function, include `anthropicSlots: slots` in the POST body:
```typescript
body: JSON.stringify({ routing, apiKeys, anthropicSlots: slots }),
```

- [ ] **B6.3 Add the UI section**

Mirror the existing per-agent routing section (the `Select` components + `setRoute` pattern at lines ~40-50, ~100+). Add after the routing table `<section>`:
```tsx
<section className="mc-panel overflow-hidden">
  <div className="border-b px-5 py-4">
    <h2 className="text-sm font-semibold">Claude Code · Anthropic slots</h2>
    <p className="text-xs text-[var(--color-ink-4)]">
      Claude Code keeps speaking Anthropic, but each slot (haiku/sonnet/opus) routes to any provider/model here.
    </p>
  </div>
  <div className="divide-y">
    {(["haiku","sonnet","opus"] as const).map((slot) => {
      const cur = slots[slot];
      const p = providers.find((x) => x.id === cur.provider);
      return (
        <div key={slot} className="flex items-center gap-3 px-5 py-3">
          <span className="w-16 text-xs font-semibold uppercase">{slot}</span>
          <Select value={cur.provider} onChange={(v) => setSlots((s) => ({ ...s, [slot]: { provider: v, model: (providers.find(x=>x.id===v)?.models[0]) ?? "" } }))}>
            {providers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          <Select value={cur.model} onChange={(v) => setSlots((s) => ({ ...s, [slot]: { ...s[slot], model: v } }))}>
            {(p?.models ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      );
    })}
  </div>
</section>
```
Adapt `Select` usage to whatever the existing code calls it (the page already imports it for the per-agent rows — match that exact API).

- [ ] **B6.4 Build + manual check**

```bash
cd ~/mission-control
npm run build && pm2 reload mission-control
```
Open the dashboard (the tunnel URL or `http://127.0.0.1:4317/settings`) and confirm the new section renders, dropdowns populate, and Save persists.

---

## Task B7: Verify the bridge end-to-end

- [ ] **B7.1 Get the gateway token**

```bash
node -e "const {readSettings}=require('C:/Users/Amari/mission-control/lib/settings.ts')" 2>/dev/null || \
node --experimental-strip-types -e "import('C:/Users/Amari/mission-control/lib/settings.ts').then(m=>console.log(m.readSettings().gatewayToken))"
```
(If neither works, read `~/.mission-control/settings.json` directly and grab `gatewayToken`.)

- [ ] **B7.2 Non-streaming smoke test**

```bash
TOK="<token from B7.1>"
curl -s http://127.0.0.1:4317/api/anthropic/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $TOK" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":50,"stream":false,"messages":[{"role":"user","content":"Say hi in 3 words"}]}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('stop_reason:',j.stop_reason);console.log('text:',j.content?.[0]?.text);console.log('usage:',JSON.stringify(j.usage))})"
```
Expected: a valid Anthropic response — `stop_reason: "end_turn"`, text present, `usage` has all four token fields.

- [ ] **B7.3 Streaming smoke test**

```bash
curl -sN http://127.0.0.1:4317/api/anthropic/v1/messages \
  -H "content-type: application/json" -H "x-api-key: $TOK" \
  -d '{"model":"claude-sonnet-4-5","max_tokens":50,"stream":true,"messages":[{"role":"user","content":"Count 1 to 3"}]}' \
  | head -40
```
Expected: `event: message_start` ... `event: content_block_delta` with `text_delta` ... `event: message_stop`. If `cascadeChat` has no streaming, fall back: in B5.2 collect the full non-stream response and emit it as one `text_delta` between `content_block_start`/`stop` — still valid Anthropic.

- [ ] **B7.4 Commit Part B**

```bash
cd ~/mission-control
git add lib/anthropic-bridge.ts lib/anthropic-bridge.test.ts app/api/anthropic lib/settings.ts app/api/settings/route.ts app/settings/page.tsx
git commit -m "feat(anthropic-bridge): /v1/messages endpoint + 3-slot router for Claude Code"
```

---

## Task B8: Repoint Claude Code (last step, reversible)

- [ ] **B8.1 Back up the current settings**

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak-$(date +%Y%m%d-%H%M%S)
```

- [ ] **B8.2 Edit `~/.claude/settings.json`**

Set these fields (preserve everything else):
```json
{
  "anthropic": {
    "apiUrl": "http://127.0.0.1:4317/api/anthropic/v1"
  },
  "headers": {
    "Authorization": "Bearer <gatewayToken>",
    "x-api-key": "<gatewayToken>"
  }
}
```
Read the current file first to see its exact structure (it currently points at NVIDIA NIM) and edit in place rather than overwriting. Keep `model: "sonnet[1m]"` if present.

- [ ] **B8.3 Live test**

```bash
# in a fresh shell, run claude and ask it something trivial
claude -p "Reply with OK and nothing else"
```
Expected: a short reply. If it fails, check `~/.mission-control/events.log` for `anthropic-bridge` lines. To roll back:
```bash
cp ~/.claude/settings.json.bak-* ~/.claude/settings.json
```

- [ ] **B8.4 Commit the rollback note (no source change)**

Nothing to commit in the repo for this step — it's external config. Just record completion here and in the resume log.

---

# PART C — Verification, execution guide, and resume protocol

## Definition of done
- [ ] Part A: meeting turns come from live LLM calls (templates only fire on failure), committed.
- [ ] Part B: `/api/anthropic/v1/messages` returns valid Anthropic shape (streaming + non-streaming), unit tests pass, 3-slot UI persists, Claude Code works end-to-end through the bridge.

## Order of execution
1. Pre-flight (P1, P2).
2. Part A fully (A1→A3). Independent; ship before B.
3. Part B B1→B2 (translator + tests — pure, no I/O).
4. Part B B3→B4 (settings plumbing).
5. Part B B5 (endpoint) — **requires reading the real `cascadeChat` signature first**.
6. Part B B6 (UI).
7. Part B B7 (verify), then B8 (repoint Claude — last, reversible).

## Known unknowns (resolve before the step that needs them)
- **`cascadeChat` exact signature** — `grep -nA25 "export.*function cascadeChat" lib/gateway.ts`. Affects A1.1 and B5.2.
- **`LiveContext` shape** — `grep -n "LiveContext\|interface.*Context" lib/meeting.ts`. Affects A1.1.
- **Existing test runner** — check `package.json` `scripts.test`. Affects B2.2.
- **The `Select` component API in `app/settings/page.tsx`** — already used for per-agent routing; match it. Affects B6.3.

## How to resume after an interruption
1. `cd ~/mission-control && git status && git log --oneline -8` — see what's committed.
2. Open this file, scan the checkboxes. The last unchecked task in the lowest-numbered incomplete group is your resume point.
3. Re-run the **Pre-flight** (P2) to confirm the app still builds before continuing.
4. If a half-finished file exists (uncommitted, broken), either finish it from the task's code block or `git checkout -- <file>` and restart that task.

## Resume log (append a line each time you start/stop)
- `2026-06-22` — blueprint created. Starting state: working tree clean, app builds, pm2 `mission-control` online. Next: Pre-flight then Part A Task A1.
