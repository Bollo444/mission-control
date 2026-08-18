import { describe, expect, test } from "vitest";
import {
  routeTurn,
  estimateTokens,
  CAPABLE_THRESHOLD,
  COST_GUARD_RATIO,
  MAX_REFLECTION_TURNS,
  GROQ_TIERS,
} from "./router";

/** Long, clearly-demanding analysis request — crosses the escalation threshold. */
const LONG_ANALYSIS =
  "analyze and explain why this is slow, compare the alternatives, evaluate every " +
  "tradeoff and assess the risks in detail, then propose a roadmap and design a " +
  "migration strategy. " +
  "filler ".repeat(120);

describe("orb router", () => {
  test("a trivial question stays on the fast Groq tier", () => {
    const d = routeTurn("what time is it");
    expect(d.tier).toBe("groq-fast");
    expect(d.delegate).toBe("groq");
    expect(d.signals.complexity).toBeLessThan(CAPABLE_THRESHOLD);
  });

  test("a demanding analysis escalates to the capable Groq tier", () => {
    const d = routeTurn(LONG_ANALYSIS);
    expect(d.tier).toBe("groq-capable");
    expect(d.delegate).toBe("groq");
    expect(d.signals.complexity).toBeGreaterThanOrEqual(CAPABLE_THRESHOLD);
  });

  test("a question about the build is answered inline, not mistaken for a task", () => {
    const d = routeTurn("why is the build slow?");
    expect(d.delegate).toBe("groq");
    expect(d.signals.agentic).toBe(false);
  });

  test("a coding task delegates to Hermes", () => {
    const d = routeTurn("fix the bug in src/foo.ts");
    expect(d.delegate).toBe("hermes");
    expect(d.signals.agentic).toBe(true);
  });

  test("a system task delegates to Hermes", () => {
    const d = routeTurn("restart the discord bot");
    expect(d.delegate).toBe("hermes");
  });

  test("preferSmart forces the capable tier even for a trivial turn", () => {
    const d = routeTurn("hi", { preferSmart: true });
    expect(d.tier).toBe("groq-capable");
  });

  test("preferFast forces the fast tier even for a demanding turn", () => {
    const d = routeTurn(LONG_ANALYSIS, { preferFast: true });
    expect(d.tier).toBe("groq-fast");
  });

  test("a nearly-exhausted budget keeps a complex turn fast", () => {
    const d = routeTurn(LONG_ANALYSIS, { budgetRatio: 0.95 });
    expect(d.tier).toBe("groq-fast");
    expect(d.reason).toMatch(/budget/i);
  });

  test("budget ratio is clamped into 0..1", () => {
    const d = routeTurn(LONG_ANALYSIS, { budgetRatio: 5 });
    expect(d.tier).toBe("groq-fast"); // clamped to 1 → cost guard fires
  });

  test("long history pushes a borderline turn over the threshold", () => {
    const history = Array.from({ length: 40 }, (_, i) => ({
      role: "user" as const,
      content: `message number ${i} with enough words to build context tokens ${i}`,
    }));
    const d = routeTurn("analyze this and propose a plan", { history });
    expect(d.signals.historyTokens).toBeGreaterThan(500);
    expect(d.signals.complexity).toBeGreaterThan(0.3);
  });

  test("estimateTokens scales with word count", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("one two three")).toBe(4); // 3 * 1.3 ≈ 4
    expect(estimateTokens("word")).toBe(1);
  });

  test("COST_GUARD_RATIO is the documented threshold", () => {
    expect(COST_GUARD_RATIO).toBe(0.9);
  });

  test("reflective circuit-breaker is hard-capped at 2 turns", () => {
    expect(MAX_REFLECTION_TURNS).toBe(2);
  });

  test("a weather ask is flagged for the weather tool, not delegated away", () => {
    const d = routeTurn("what's the weather like today?");
    expect(d.signals.intents).toContain("weather");
    expect(d.delegate).toBe("groq"); // answered inline with the tool's data
  });

  test("a casual temperature ask still triggers the weather tool", () => {
    const d = routeTurn("how cold is it outside right now");
    expect(d.signals.intents).toContain("weather");
  });

  test("a non-weather turn has no weather intent", () => {
    const d = routeTurn("what time is it");
    expect(d.signals.intents).not.toContain("weather");
  });

  test("tier defaults point at verified-live Groq model ids", () => {
    // Verified on this account's key (probed 2026-08-18).
    expect(GROQ_TIERS["groq-fast"].model).toBe("openai/gpt-oss-20b");
    expect(GROQ_TIERS["groq-capable"].model).toBe("openai/gpt-oss-120b");
  });
});
