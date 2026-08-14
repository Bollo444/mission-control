/**
 * orb/router.ts
 *
 * The orb's intelligent routing system. Every turn is classified along three
 * axes — complexity, context, and cost — and delegated to either the cheap
 * Gemini 2.0 backend or the more capable Gemini 3.0 backend, or handed to
 * Hermes when the turn is an actual task (agentic) rather than a question.
 *
 * The classifier is deliberately deterministic and zero-cost: it runs in
 * microseconds with no extra LLM call, so routing never adds latency or spend
 * to the very turn it is trying to make cheaper.
 */

import type {
  OrbTier,
  OrbTurnMessage,
  RouteDecision,
  RouteSignals,
} from "./types";

/** Concrete Gemini model ids per tier — env-overridable so a key whose API
 *  window has moved on (e.g. 2.0 retired upstream) can be repointed without
 *  a code change. Defaults honor the user's "Gemini 2.0 / Gemini 3.0" naming. */
export const GEMINI_TIERS: Record<OrbTier, { model: string; label: string }> = {
  "gemini-2.0": {
    model: process.env.ORB_GEMINI_20_MODEL || "gemini-2.0-flash",
    label: "Gemini 2.0",
  },
  "gemini-3.0": {
    model: process.env.ORB_GEMINI_30_MODEL || "gemini-3-flash",
    label: "Gemini 3.0",
  },
};

/** Complexity (0..1) above which a turn escalates to the capable tier. */
export const CAPABLE_THRESHOLD = 0.55;
/** Fraction of the daily budget consumed above which cost forces the cheap tier. */
export const COST_GUARD_RATIO = 0.9;

/** Hard cap on reflective retries per turn (the file's max_reflection_turns = 2). */
export const MAX_REFLECTION_TURNS = 2;

/**
 * Map a router complexity score (0..1) to a Gemini extended-thinking budget.
 * Simple turns get no thinking config at all (0 tokens — no waste); escalating
 * complexity unlocks deeper reasoning, capped at 8192 so a single turn can
 * never blow the budget. Only meaningful on thinking-capable tiers.
 */
export function thinkingBudgetForComplexity(complexity: number): number {
  const c = Math.min(1, Math.max(0, complexity));
  if (c < 0.3) return 0;
  if (c < 0.55) return 2048;
  if (c < 0.8) return 4096;
  return 8192;
}

interface IntentRule {
  id: string;
  label: string;
  weight: number;
  pattern: RegExp;
}

/** Intent lexicon — each match adds to the complexity score and (for
 *  "system"/"code") can mark the turn agentic. Weights are tuned so one strong
 *  signal alone doesn't blow past the escalation threshold. */
const INTENTS: IntentRule[] = [
  {
    id: "code",
    label: "coding",
    weight: 0.18,
    pattern:
      /\b(build|implement|refactor|debug|fix|write|create|add|generate|deploy|migrate|optimiz|rewrite|patch|scaffold|commit|compile|test|run)\b/i,
  },
  {
    id: "analysis",
    label: "analysis",
    weight: 0.15,
    pattern:
      /\b(analy[sz]e|explain|compare|evaluat|investigat|diagnos|root cause|\bwhy\b|how does|assess|audit|benchmark|profile|understand)\b/i,
  },
  {
    id: "planning",
    label: "planning",
    weight: 0.12,
    pattern:
      /\b(plan|roadmap|strategy|architect(ure)?|design|propose|blueprint|break down|step[- ]by[- ]step|steps)\b/i,
  },
  {
    id: "longform",
    label: "long-form",
    weight: 0.1,
    pattern:
      /\b(write (a |an |the )?(report|essay|article|summary|doc|documentation|readme|spec)|summari[sz]e|comprehensive|in[- ]depth|detailed)\b/i,
  },
  {
    id: "system",
    label: "system task",
    weight: 0.2,
    pattern:
      /\b(execute|do this|perform|take over|control|manage|schedule|automate|deploy to|\bssh\b|kill|restart|provision|set up|configure|install)\b/i,
  },
];

/** Imperative action verbs — when a turn is both "code" and one of these, it is
 *  a task to run, not a question to answer. */
const ACTION_VERBS =
  /\b(fix|build|refactor|implement|deploy|run|execute|create|write|add|remove|update|install|configure|restart|kill|commit|test|patch|scaffold|migrate|rewrite|optimize)\b/i;

/** Heuristic for "this is a question, not an order" — so "why is the build
 *  slow" stays a Gemini question instead of being mistaken for a task. */
const QUESTIONISH =
  /^\s*(why|how|what|when|which|who)\b/i;

/** Rough token estimate: ~1.3 tokens per word plus punctuation overhead. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.3));
}

function historyTokens(history: OrbTurnMessage[] | undefined): number {
  if (!Array.isArray(history)) return 0;
  return history.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

function detectIntents(message: string, contextHint?: string): string[] {
  const hay = `${message}\n${contextHint ?? ""}`;
  const matched: string[] = [];
  for (const rule of INTENTS) {
    if (rule.pattern.test(hay)) matched.push(rule.label);
    // These patterns are stateless, but reset lastIndex defensively.
    rule.pattern.lastIndex = 0;
  }
  return matched;
}

function intentWeight(message: string, contextHint?: string): number {
  const hay = `${message}\n${contextHint ?? ""}`;
  let sum = 0;
  for (const rule of INTENTS) {
    if (rule.pattern.test(hay)) sum += rule.weight;
    rule.pattern.lastIndex = 0;
  }
  return sum;
}

/** Is this turn a task Hermes should execute, rather than a question to answer
 *  inline? System-intent turns are always agentic; code turns are agentic when
 *  they carry an imperative action verb and aren't a question ("fix the bug in
 *  X" vs "why is X slow"). */
function isAgentic(message: string, intents: string[], contextHint?: string): boolean {
  const hay = `${message}\n${contextHint ?? ""}`;
  if (intents.includes("system task")) return true;
  if (intents.includes("coding") && ACTION_VERBS.test(hay) && !QUESTIONISH.test(message)) {
    return true;
  }
  return false;
}

export interface RouteOptions {
  /** Force the cheap tier (user pin). */
  preferFast?: boolean;
  /** Force the capable tier (user pin). */
  preferSmart?: boolean;
  /** 0..1 — fraction of the day's budget already consumed (cost guard). */
  budgetRatio?: number;
  /** Optional UI hint that adds context without changing the user's words. */
  contextHint?: string;
  history?: OrbTurnMessage[];
}

/**
 * Classify one orb turn and choose a backend.
 *
 * Scoring: complexity = length (≤0.5) + intent (≤0.5) + context (≤0.3),
 * clamped to 0..1. Default is the cheap tier; escalation to Gemini 3.0 happens
 * when complexity crosses CAPABLE_THRESHOLD and the budget isn't nearly
 * exhausted. Agentic turns are delegated to Hermes regardless of tier.
 */
export function routeTurn(message: string, opts: RouteOptions = {}): RouteDecision {
  const msgTokens = estimateTokens(message);
  const histTokens = historyTokens(opts.history);
  const intents = detectIntents(message, opts.contextHint);
  const agentic = isAgentic(message, intents, opts.contextHint);

  const lengthComponent = Math.min(0.5, msgTokens / 400);
  const intentComponent = Math.min(0.5, intentWeight(message, opts.contextHint));
  const contextComponent = Math.min(0.3, histTokens / 4000);
  const complexity = Math.min(
    1,
    Math.max(0, lengthComponent + intentComponent + contextComponent),
  );

  const budgetRatio = Math.min(1, Math.max(0, opts.budgetRatio ?? 0));
  const nearBudget = budgetRatio >= COST_GUARD_RATIO;
  const shouldEscalate = complexity >= CAPABLE_THRESHOLD;

  let tier: OrbTier;
  let reason: string;

  if (opts.preferSmart) {
    tier = "gemini-3.0";
    reason = "You asked for the capable tier this turn.";
  } else if (opts.preferFast) {
    tier = "gemini-2.0";
    reason = "You asked for the fast, low-cost tier this turn.";
  } else if (shouldEscalate && nearBudget) {
    // Complex, but the budget is nearly gone — keep it cheap and say why.
    tier = "gemini-2.0";
    reason = "Complex turn, but daily budget is nearly exhausted — kept on the cheap tier.";
  } else if (shouldEscalate) {
    tier = "gemini-3.0";
    reason = `Complex turn (score ${complexity.toFixed(2)}) — escalated to the capable tier.`;
  } else {
    tier = "gemini-2.0";
    reason = `Simple turn (score ${complexity.toFixed(2)}) — served by the fast tier.`;
  }

  const signals: RouteSignals = {
    complexity: Math.round(complexity * 100) / 100,
    messageTokens: msgTokens,
    historyTokens: histTokens,
    intents,
    agentic,
  };

  return {
    tier,
    model: GEMINI_TIERS[tier].model,
    delegate: agentic ? "hermes" : "gemini",
    reason: agentic ? `${reason} Task execution delegated to Hermes.` : reason,
    signals,
  };
}
