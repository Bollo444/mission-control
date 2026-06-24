import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSlot,
  makeAnthropicError,
  anthropicToOpenAI,
  openAIToAnthropic,
} from "../lib/anthropic-bridge.js";

/* ===================================================================
   Unit tests for the Anthropic <-> OpenAI translator.
   Run: node --import tsx tests/anthropic-bridge.test.ts
   or:  npx tsx tests/anthropic-bridge.test.ts
   =================================================================== */

describe("parseSlot", () => {
  it('maps haiku to "haiku"', () => assert.equal(parseSlot("claude-haiku-4-5"), "haiku"));
  it('maps opus to "opus"', () => assert.equal(parseSlot("claude-opus-4-8"), "opus"));
  it('maps sonnet to "sonnet"', () => assert.equal(parseSlot("claude-sonnet-4-6"), "sonnet"));
  it('maps sonnet[1m] to "sonnet"', () => assert.equal(parseSlot("sonnet[1m]"), "sonnet"));
  it('defaults unknown to "sonnet"', () => assert.equal(parseSlot("gpt-4"), "sonnet"));
  it("defaults null to sonnet", () => assert.equal(parseSlot(null), "sonnet"));
  it("defaults undefined to sonnet", () => assert.equal(parseSlot(undefined), "sonnet"));
  it("defaults empty to sonnet", () => assert.equal(parseSlot(""), "sonnet"));
});

describe("makeAnthropicError", () => {
  it("returns 401 auth error shape", () => {
    const e = makeAnthropicError(401, "bad key");
    assert.equal(e.status, 401);
    assert.equal(e.body.type, "error");
    assert.equal(e.body.error.type, "authentication_error");
    assert.equal(e.body.error.message, "bad key");
  });
  it("returns 429 rate limit shape", () => {
    const e = makeAnthropicError(429, "slow down");
    assert.equal(e.body.error.type, "rate_limit_error");
  });
  it("returns 503 api error shape", () => {
    const e = makeAnthropicError(503, "upstream down");
    assert.equal(e.body.error.type, "api_error");
  });
  it("returns 400 invalid_request for 400", () => {
    const e = makeAnthropicError(400, "bad body");
    assert.equal(e.body.error.type, "invalid_request_error");
  });
});

describe("anthropicToOpenAI — request translation", () => {
  it("passes through stream, max_tokens, temperature", () => {
    const out = anthropicToOpenAI({ stream: true, max_tokens: 1024, temperature: 0.7 });
    assert.equal(out.stream, true);
    assert.equal(out.max_tokens, 1024);
    assert.equal(out.temperature, 0.7);
  });

  it("maps system string → system message", () => {
    const out = anthropicToOpenAI({ system: "You are helpful.", messages: [] });
    assert.equal((out.messages as any[])[0].role, "system");
    assert.equal((out.messages as any[])[0].content, "You are helpful.");
  });

  it("maps system array blocks → system message (strips cache_control)", () => {
    const out = anthropicToOpenAI({
      system: [
        { type: "text", text: "Part A", cache_control: { type: "ephemeral" } },
        { type: "text", text: "Part B" },
      ],
      messages: [],
    });
    const sys = (out.messages as any[])[0];
    assert.equal(sys.role, "system");
    assert.equal(sys.content, "Part A\n\nPart B");
  });

  it("maps string messages", () => {
    const out = anthropicToOpenAI({
      messages: [{ role: "user", content: "Hello" }, { role: "assistant", content: "Hi there" }],
    });
    assert.deepEqual((out.messages as any[])[0], { role: "user", content: "Hello" });
    assert.deepEqual((out.messages as any[])[1], { role: "assistant", content: "Hi there" });
  });

  it("maps user content blocks (text + image + tool_result)", () => {
    const out = anthropicToOpenAI({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
            { type: "tool_result", tool_use_id: "toolu_123", content: "42" },
          ],
        },
      ],
    });
    const msgs = out.messages as any[];
    // tool_result becomes a {role:"tool"} message
    const toolMsg = msgs.find((m) => m.role === "tool");
    assert.ok(toolMsg);
    assert.equal(toolMsg.tool_call_id, "toolu_123"); // round-trip preserved
    assert.equal(toolMsg.content, "42");
    // text + image become a user message with parts
    const userMsg = msgs.find((m) => m.role === "user");
    assert.ok(userMsg);
    assert.ok(Array.isArray(userMsg.content));
    assert.equal(userMsg.content[0].type, "text");
    assert.equal(userMsg.content[1].type, "image_url");
    assert.ok(userMsg.content[1].image_url.url.includes("data:image/png;base64,abc123"));
  });

  it("maps assistant tool_use blocks → tool_calls", () => {
    const out = anthropicToOpenAI({
      messages: [
        {
          role: "assistant",
          content: [
            { type: "text", text: "Let me check." },
            { type: "tool_use", id: "toolu_456", name: "Bash", input: { command: "ls" } },
          ],
        },
      ],
    });
    const msgs = out.messages as any[];
    assert.equal(msgs[0].role, "assistant");
    assert.equal(msgs[0].content, "Let me check.");
    assert.equal(msgs[0].tool_calls[0].id, "toolu_456");
    assert.equal(msgs[0].tool_calls[0].function.name, "Bash");
    assert.equal(msgs[0].tool_calls[0].function.arguments, JSON.stringify({ command: "ls" }));
  });

  it("maps tools → functions", () => {
    const out = anthropicToOpenAI({
      tools: [{ name: "Bash", description: "Run a command", input_schema: { type: "object", properties: { command: { type: "string" } } } }],
      messages: [],
    });
    assert.ok(Array.isArray(out.tools));
    assert.equal(out.tools[0].type, "function");
    assert.equal(out.tools[0].function.name, "Bash");
  });

  it("maps tool_choice: auto/any/tool/none", () => {
    assert.equal(anthropicToOpenAI({ tool_choice: { type: "auto" }, messages: [] }).tool_choice, "auto");
    assert.equal(anthropicToOpenAI({ tool_choice: { type: "any" }, messages: [] }).tool_choice, "required");
    assert.deepEqual(
      anthropicToOpenAI({ tool_choice: { type: "tool", name: "Bash" }, messages: [] }).tool_choice,
      { type: "function", function: { name: "Bash" } }
    );
    assert.equal(anthropicToOpenAI({ tool_choice: { type: "none" }, messages: [] }).tool_choice, "none");
  });
});

describe("openAIToAnthropic — response translation", () => {
  it("produces valid Anthropic message envelope", () => {
    const resp = openAIToAnthropic(
      { choices: [{ message: { content: "Hello!" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } },
      "claude-sonnet-4-6"
    );
    assert.equal(resp.type, "message");
    assert.equal(resp.role, "assistant");
    assert.equal(resp.model, "claude-sonnet-4-6");
    assert.equal(resp.stop_reason, "end_turn");
    assert.ok(resp.id.startsWith("msg_"));
  });

  it("maps text content correctly", () => {
    const resp = openAIToAnthropic(
      { choices: [{ message: { content: "Hi there" }, finish_reason: "stop" }] },
      "sonnet"
    );
    assert.equal(resp.content[0].type, "text");
    assert.equal(resp.content[0].text, "Hi there");
  });

  it("maps tool_calls to tool_use blocks", () => {
    const resp = openAIToAnthropic(
      {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "call_abc", function: { name: "Bash", arguments: '{"command":"ls"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
      "opus"
    );
    assert.equal(resp.stop_reason, "tool_use");
    assert.equal(resp.content[0].type, "tool_use");
    assert.equal(resp.content[0].name, "Bash");
    assert.deepEqual(resp.content[0].input, { command: "ls" });
    // tool call id is preserved (wrapped in toolu_ prefix if needed? no — we preserve as-is)
    assert.ok(String(resp.content[0].id).includes("call_abc"));
  });

  it("maps stop reasons correctly", () => {
    const check = (fr: string, expected: string) => {
      const resp = openAIToAnthropic(
        { choices: [{ message: { content: "" }, finish_reason: fr }] },
        "sonnet"
      );
      assert.equal(resp.stop_reason, expected, `finish_reason=${fr} → ${resp.stop_reason}, expected ${expected}`);
    };
    check("stop", "end_turn");
    check("length", "max_tokens");
    check("tool_calls", "tool_use");
    check("function_call", "tool_use");
    check("unknown_reason", "end_turn"); // unknown maps to end_turn
  });

  it("synthesizes missing usage to 0", () => {
    const resp = openAIToAnthropic(
      { choices: [{ message: { content: "x" }, finish_reason: "stop" }] },
      "sonnet"
    );
    assert.equal(resp.usage.input_tokens, 0);
    assert.equal(resp.usage.output_tokens, 0);
    assert.equal(resp.usage.cache_creation_input_tokens, 0);
    assert.equal(resp.usage.cache_read_input_tokens, 0);
  });

  it("reports usage when present", () => {
    const resp = openAIToAnthropic(
      { choices: [{ message: { content: "x" }, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 50 } },
      "sonnet"
    );
    assert.equal(resp.usage.input_tokens, 100);
    assert.equal(resp.usage.output_tokens, 50);
  });

  it("returns empty text block for empty content", () => {
    const resp = openAIToAnthropic(
      { choices: [{ message: {}, finish_reason: "stop" }] },
      "sonnet"
    );
    assert.equal(resp.content[0].type, "text");
    assert.equal(resp.content[0].text, "");
  });
});
