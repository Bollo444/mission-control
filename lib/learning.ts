import fs from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";

export type EventKind =
  | "panel:switch"
  | "file:open"
  | "file:save"
  | "agent:launch"
  | "agent:dispatch"
  | "repo:clone"
  | "repo:delete"
  | "term:open"
  | "term:close"
  | "meeting:convene"
  | "search:query"
  | "palette:action"
  | "healer:run"
  | "healer:repair";

export interface UsageEvent {
  ts: string;
  kind: EventKind;
  detail?: string;
  meta?: Record<string, string | number | boolean>;
}

/* ------------------------------------------------------------------ *
 * Append-only event log stored as JSONL. Rotated at 5000 entries.    *
 * All analysis is derived from this log — never mutated in place.     *
 * ------------------------------------------------------------------ */

const EVENTS_FILE = path.join(MC_CONFIG_DIR, "learning.jsonl");
const MAX_EVENTS = 5000;

function ensureFile(): void {
  try {
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, "", "utf8");
  } catch {
    /* non-fatal */
  }
}

export function trackEvent(event: UsageEvent): void {
  try {
    ensureFile();
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + "\n", "utf8");
    rotateIfNeeded();
  } catch {
    /* non-fatal */
  }
}

function rotateIfNeeded(): void {
  try {
    const raw = fs.readFileSync(EVENTS_FILE, "utf8");
    const lines = raw.trim().split("\n");
    if (lines.length > MAX_EVENTS) {
      fs.writeFileSync(EVENTS_FILE, lines.slice(-Math.floor(MAX_EVENTS * 0.7)).join("\n") + "\n", "utf8");
    }
  } catch {
    /* non-fatal */
  }
}

function loadEvents(): UsageEvent[] {
  try {
    ensureFile();
    const raw = fs.readFileSync(EVENTS_FILE, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as UsageEvent;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as UsageEvent[];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * Profile — derived from event history.                              *
 * ------------------------------------------------------------------ */

export interface HourBucket {
  hour: number; // 0-23
  count: number;
}

export interface AgentUsage {
  agentId: string;
  launches: number;
  dispatches: number;
}

export interface PanelUsage {
  panel: string;
  switches: number;
}

export interface SequencePattern {
  from: string;
  to: string;
  count: number;
}

export interface UserProfile {
  totalEvents: number;
  firstEvent: string | null;
  lastEvent: string | null;
  hours: HourBucket[];
  panels: PanelUsage[];
  agents: AgentUsage[];
  sequences: SequencePattern[];
  topSearchTerms: { term: string; count: number }[];
  activeSessionCount: number;
  avgSessionDurationMin: number;
}

export interface LearningInsight {
  type: string;
  label: string;
  detail: string;
}

/* ------------------------------------------------------------------ *
 * Analyze the event log to build a user profile.                     *
 * ------------------------------------------------------------------ */

export function buildProfile(): UserProfile {
  const events = loadEvents();
  if (events.length === 0) {
    return {
      totalEvents: 0,
      firstEvent: null,
      lastEvent: null,
      hours: [],
      panels: [],
      agents: [],
      sequences: [],
      topSearchTerms: [],
      activeSessionCount: 0,
      avgSessionDurationMin: 0,
    };
  }

  // Hour heatmap
  const hourMap = new Map<number, number>();
  for (let i = 0; i < 24; i++) hourMap.set(i, 0);
  for (const e of events) {
    try {
      const h = new Date(e.ts).getHours();
      hourMap.set(h, (hourMap.get(h) ?? 0) + 1);
    } catch {
      /* skip */
    }
  }
  const hours: HourBucket[] = Array.from(hourMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  // Panel usage
  const panelMap = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "panel:switch") {
      const p = e.detail || "unknown";
      panelMap.set(p, (panelMap.get(p) ?? 0) + 1);
    }
  }
  const panels: PanelUsage[] = Array.from(panelMap.entries())
    .map(([panel, switches]) => ({ panel, switches }))
    .sort((a, b) => b.switches - a.switches);

  // Agent usage
  const agentLaunches = new Map<string, number>();
  const agentDispatches = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "agent:launch" && e.detail) {
      agentLaunches.set(e.detail, (agentLaunches.get(e.detail) ?? 0) + 1);
    }
    if (e.kind === "agent:dispatch" && e.detail) {
      agentDispatches.set(e.detail, (agentDispatches.get(e.detail) ?? 0) + 1);
    }
  }
  const allAgents = new Set([...agentLaunches.keys(), ...agentDispatches.keys()]);
  const agents: AgentUsage[] = Array.from(allAgents).map((agentId) => ({
    agentId,
    launches: agentLaunches.get(agentId) ?? 0,
    dispatches: agentDispatches.get(agentId) ?? 0,
  })).sort((a, b) => (b.launches + b.dispatches) - (a.launches + a.dispatches));

  // Two-step sequences (window of 2 events)
  const seqMap = new Map<string, number>();
  for (let i = 0; i < events.length - 1; i++) {
    const key = `${events[i].kind}→${events[i + 1].kind}`;
    seqMap.set(key, (seqMap.get(key) ?? 0) + 1);
  }
  const sequences: SequencePattern[] = Array.from(seqMap.entries())
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return { from, to, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  // Search terms
  const searchMap = new Map<string, number>();
  for (const e of events) {
    if (e.kind === "search:query" && e.detail) {
      searchMap.set(e.detail, (searchMap.get(e.detail) ?? 0) + 1);
    }
  }
  const topSearchTerms = Array.from(searchMap.entries())
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Session detection: clusters of activity with >15 min gaps
  const timestamps = events
    .map((e) => new Date(e.ts).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b);

  let sessions = 0;
  let totalDuration = 0;
  let sessionStart = timestamps[0] ?? 0;
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1];
    if (gap > 15 * 60 * 1000) {
      totalDuration += timestamps[i - 1] - sessionStart;
      sessions++;
      sessionStart = timestamps[i];
    }
  }
  if (timestamps.length > 0) {
    totalDuration += timestamps[timestamps.length - 1] - sessionStart;
    sessions++;
  }

  return {
    totalEvents: events.length,
    firstEvent: events[0]?.ts ?? null,
    lastEvent: events[events.length - 1]?.ts ?? null,
    hours,
    panels,
    agents,
    sequences,
    topSearchTerms,
    activeSessionCount: sessions,
    avgSessionDurationMin: sessions > 0 ? Math.round(totalDuration / sessions / 60000) : 0,
  };
}

export function generateInsights(profile: UserProfile): LearningInsight[] {
  const insights: LearningInsight[] = [];

  if (profile.totalEvents === 0) {
    insights.push({ type: "empty", label: "Not enough data", detail: "Keep using the dashboard — insights will appear here as patterns emerge." });
    return insights;
  }

  // Peak hour
  const peak = profile.hours.reduce((a, b) => (a.count > b.count ? a : b));
  const peakLabel = peak.count > 0
    ? `${peak.hour.toString().padStart(2, "0")}:00 — ${peak.hour.toString().padStart(2, "0")}:59 (${peak.count} actions)`
    : "Not enough data yet";
  insights.push({ type: "peak", label: "Peak usage time", detail: peakLabel });

  // Favorite panel
  if (profile.panels.length > 0) {
    const top = profile.panels[0];
    insights.push({ type: "panel", label: `Favorite panel: ${top.panel}`, detail: `Switched to ${top.panel} ${top.switches} times` });
  }

  // Favorite agent
  if (profile.agents.length > 0) {
    const top = profile.agents[0];
    const total = top.launches + top.dispatches;
    insights.push({ type: "agent", label: `Most-used agent: ${top.agentId}`, detail: `${total} launches + dispatches` });
  }

  // Common workflow
  if (profile.sequences.length > 0) {
    const topSeq = profile.sequences[0];
    const fromLabel = topSeq.from.replace(":", " → ");
    const toLabel = topSeq.to.replace(":", " → ");
    insights.push({ type: "sequence", label: "Most common workflow", detail: `"${fromLabel}" then "${toLabel}" (${topSeq.count}x)` });

    if (profile.sequences.length > 1) {
      const second = profile.sequences[1];
      insights.push({ type: "sequence2", label: "Second most common", detail: `"${second.from.replace(":", " → ")}" then "${second.to.replace(":", " → ")}" (${second.count}x)` });
    }
  }

  // Sessions
  insights.push({ type: "sessions", label: "Usage sessions", detail: `${profile.activeSessionCount} sessions detected, avg ${profile.avgSessionDurationMin} min each` });

  // Search patterns
  if (profile.topSearchTerms.length > 0) {
    insights.push({ type: "search", label: "Top search terms", detail: profile.topSearchTerms.slice(0, 3).map((t) => `"${t.term}"`).join(", ") });
  }

  return insights;
}
