import { afterEach, describe, expect, test, vi } from "vitest";
import { buildBody, streamGroq } from "./groq";

function opts(overrides: Partial<Parameters<typeof buildBody>[0]> = {}) {
  return {
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user" as const, content: "hello" }],
    apiKey: "gsk-test",
    ...overrides,
  };
}

describe("groq buildBody", () => {
  test("messages flow through as OpenAI-style turns", () => {
    const body = buildBody(opts()) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages).toEqual([{ role: "user", content: "hello" }]);
  });

  test("a system prompt is prepended as the first message", () => {
    const body = buildBody(opts({ system: "Live weather: sunny" })) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages[0]).toEqual({ role: "system", content: "Live weather: sunny" });
    expect(body.messages[1]).toEqual({ role: "user", content: "hello" });
  });

  test("temperature, max_tokens and the model id are in the body", () => {
    const body = buildBody(opts()) as { temperature: number; max_tokens: number; model: string };
    expect(body.temperature).toBe(0.7);
    expect(body.max_tokens).toBe(1024);
    expect(body.model).toBe("openai/gpt-oss-120b");
  });
});

describe("streamGroq", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sseResponse(body: string): Response {
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  test("yields content deltas, skipping the reasoning deltas", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"the user says ok"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Ok"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"."}}]}\n\n',
      "data: [DONE]\n\n",
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse(sse)));

    const chunks: string[] = [];
    for await (const text of streamGroq(opts())) chunks.push(text);

    expect(chunks).toEqual(["Ok", "."]);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer gsk-test");
    expect(JSON.parse(init?.body as string).stream).toBe(true);
  });

  test("throws a Groq-prefixed error on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), { status: 401 }),
      ),
    );
    await expect(async () => {
      for await (const _ of streamGroq(opts())) void _;
    }).rejects.toThrow(/Groq 401/);
  });
});
