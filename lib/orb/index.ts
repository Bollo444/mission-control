/**
 * orb — Mission Control's modular, Hermes-powered voice agent.
 *
 * Public surface:
 *   - router.ts  — intelligent Gemini 2.0/3.0 routing (complexity/context/cost)
 *   - gemini.ts  — direct Gemini REST streaming client
 *   - types.ts   — shared orb types
 *
 * The HTTP seam is app/api/orb/turn (streaming turn endpoint); the UI lives in
 * components/orb/JarvisVoice.tsx.
 */

export * from "./types";
export {
  routeTurn,
  GEMINI_TIERS,
  CAPABLE_THRESHOLD,
  COST_GUARD_RATIO,
  MAX_REFLECTION_TURNS,
  thinkingBudgetForComplexity,
  estimateTokens,
} from "./router";
export { streamGemini, geminiChat } from "./gemini";
