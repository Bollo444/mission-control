import { describe, expect, test } from "vitest";
import { buildBody } from "./gemini";

function opts(overrides: Partial<Parameters<typeof buildBody>[0]> = {}) {
  return {
    model: "gemini-3-flash",
    messages: [{ role: "user" as const, content: "hello" }],
    apiKey: "test-key",
    ...overrides,
  };
}

describe("gemini buildBody", () => {
  test("no thinkingBudget → no thinkingConfig is attached", () => {
    const body = buildBody(opts()) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  test("thinkingBudget 0 → no thinkingConfig (explicit zero is treated as off)", () => {
    const body = buildBody(opts({ thinkingBudget: 0 })) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  test("positive thinkingBudget → thinkingConfig carries it", () => {
    const body = buildBody(opts({ thinkingBudget: 8192 })) as {
      generationConfig: { thinkingConfig: { thinkingBudget: number } };
    };
    expect(body.generationConfig.thinkingConfig).toEqual({
      thinkingBudget: 8192,
    });
  });

  test("system instruction is included when provided", () => {
    const body = buildBody(
      opts({ system: "A previous attempt failed. Fix it." }),
    ) as { systemInstruction: { parts: Array<{ text: string }> } };
    expect(body.systemInstruction.parts[0].text).toContain(
      "A previous attempt failed",
    );
  });

  test("temperature and maxOutputTokens defaults hold", () => {
    const body = buildBody(opts()) as {
      generationConfig: { temperature: number; maxOutputTokens: number };
    };
    expect(body.generationConfig.temperature).toBe(0.7);
    expect(body.generationConfig.maxOutputTokens).toBe(1024);
  });
});
