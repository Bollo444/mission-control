/**
 * orb — Mission Control's modular, Hermes-powered voice agent.
 *
 * Public surface:
 *   - router.ts  — intelligent Groq fast/capable routing (complexity/context/cost)
 *   - groq.ts    — direct Groq OpenAI-compatible streaming client
 *   - types.ts   — shared orb types
 *
 * The HTTP seam is app/api/orb/turn (streaming turn endpoint); the UI lives in
 * components/orb/JarvisVoice.tsx.
 */

export * from "./types";
export {
  routeTurn,
  GROQ_TIERS,
  CAPABLE_THRESHOLD,
  COST_GUARD_RATIO,
  MAX_REFLECTION_TURNS,
  estimateTokens,
} from "./router";
export { streamGroq, groqChat } from "./groq";
