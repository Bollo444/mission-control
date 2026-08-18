/**
 * orb/types.ts
 *
 * Shared types for the orb — Mission Control's modular, Hermes-powered voice
 * agent. The orb is a real-time, bidirectional voice interface: it listens,
 * routes each turn to the cheapest capable Groq backend, streams the reply
 * back, and hands task execution to Hermes when a turn needs real agent tools.
 */

/** The two Groq backend tiers the orb routes between. */
export type OrbTier = "groq-fast" | "groq-capable";

/** A single conversation turn, OpenAI-style (role + text). */
export interface OrbTurnMessage {
  role: "user" | "assistant";
  content: string;
}

/** What the client sends for one orb turn. */
export interface OrbTurnRequest {
  /** The user's message (spoken or typed). */
  message: string;
  /** Prior turns in this conversation, oldest first, for context scoring. */
  history?: OrbTurnMessage[];
  /** User pin: force the fast tier this turn. */
  preferFast?: boolean;
  /** User pin: force the capable tier this turn. */
  preferSmart?: boolean;
  /** Optional hint from the UI (e.g. "task: deploy", "file: src/foo.ts"). */
  contextHint?: string;
  /** Client-resolved coordinates — lets the weather tool answer for the
   *  user's actual location instead of a fallback. */
  lat?: number;
  lon?: number;
}

/** Structured signals the router derived while classifying a turn. */
export interface RouteSignals {
  /** 0..1 — how demanding the turn is (length + intent + context). */
  complexity: number;
  /** Estimated token count of the incoming message. */
  messageTokens: number;
  /** Estimated token count of the conversation history. */
  historyTokens: number;
  /** Human-readable intents matched (code, analysis, planning, …). */
  intents: string[];
  /** True when the turn should be executed by Hermes instead of answered inline. */
  agentic: boolean;
}

/** The router's decision for one turn. */
export interface RouteDecision {
  /** Which Groq backend should answer (or was chosen before a Hermes handoff). */
  tier: OrbTier;
  /** Concrete Groq model id selected for the tier. */
  model: string;
  /** Where the turn executes: inline Groq, or Hermes (agentic handoff). */
  delegate: "groq" | "hermes";
  /** One-sentence, user-facing rationale for the choice. */
  reason: string;
  signals: RouteSignals;
}

/** Streamed events emitted by the /api/orb/turn endpoint. */
export type OrbTurnEvent =
  | { type: "route"; tier: OrbTier | "hermes"; model: string; reason: string; complexity: number }
  | { type: "chunk"; text: string }
  | { type: "done"; tier: OrbTier | "hermes"; model: string }
  | { type: "error"; message: string };
