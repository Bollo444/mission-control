// Client-safe shared types mirroring the API payloads.

export interface ConfigView {
  path: string;
  exists: boolean;
  kind: "toml" | "json" | "dir" | "missing";
  keys?: string[];
  preview?: string;
  entries?: string[];
  error?: string;
}

export interface AgentStatus {
  id: string;
  installed: boolean;
  binPath: string | null;
  version: string | null;
  configs: ConfigView[];
  hasConfig: boolean;
  sessionCount: number;
  lastActive: string | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  tagline: string;
  kind: "cli" | "ide" | "framework";
  accent: string;
  glyph: string;
  primary: boolean;
  tools: string[];
  homepage?: string;
  installable: boolean;
  status: AgentStatus;
}

export interface SessionMeta {
  agentId: string;
  id: string;
  title: string;
  path: string;
  mtime: string;
  sizeKB: number;
  messages: number | null;
  project?: string;
}

export interface ActivityEntry {
  ts: string;
  agentId: string;
  agentName: string;
  action: string;
  detail?: string;
}

export interface RouteRule {
  provider: string;
  model: string;
}

export interface Provider {
  id: string;
  name: string;
  keyEnv: string;
  models: string[];
  free?: boolean;
  /** Human-readable approximate free-tier allowance, shown in the routing UI. */
  freeLimit?: string;
}

export interface PublicSettings {
  vaultDir: string;
  /** Live route in use per agent (may be a health failover). */
  routing: Record<string, RouteRule>;
  /** The user's chosen default per agent — what the fleet auto-reverts to. */
  routingPreferred: Record<string, RouteRule>;
  keyStatus: Record<string, boolean>;
  /** Mission Control's Fleet Gateway access token (its own token, shown to you). */
  gatewayToken: string;
  updatedAt: string;
  providers: Provider[];
}

// ---- Free-tier health monitoring (probe + auto-failover) ----

export type ProviderStatus = "available" | "unavailable" | "unconfigured" | "unknown";

export interface ProviderHealth {
  id: string;
  status: ProviderStatus;
  checkedAt: string | null;
  detail?: string;
  /** model id -> true (available) / false (confirmed unavailable) / null (unverified). */
  models: Record<string, boolean | null>;
}

export interface HealthAction {
  ts: string;
  agentId: string;
  kind: "failover" | "restore";
  from: string; // "provider/model"
  to: string; // "provider/model"
  reason: string;
}

export interface HealthState {
  lastCheckedAt: string | null;
  intervalMinutes: number;
  providers: Record<string, ProviderHealth>;
  actions: HealthAction[]; // newest first
}

// ---- Universal logbook (the Logs tab) ----

export type LogLevel = "info" | "success" | "warn" | "error";

export interface LogEvent {
  ts: string;
  source: string;
  level: LogLevel;
  event: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

export interface LogsResp {
  events: LogEvent[];
  sources: string[];
  generatedAt: string;
}

export interface AgentDetail extends Omit<AgentSummary, "installable"> {
  docsNote?: string;
  install: { manager: string; command: string; docs?: string; unverified?: boolean } | null;
  route: RouteRule | null;
  sessions: SessionMeta[];
  memory: string;
}

export interface NavAgent {
  id: string;
  name: string;
  accent: string;
  glyph: string;
  primary: boolean;
  kind: string;
}

export interface MemoryResp {
  vaultDir: string;
  created?: boolean;
  activity: ActivityEntry[];
  shared?: string;
}

export interface AgentsResp {
  agents: AgentSummary[];
  generatedAt: string;
}

export interface VaultNode {
  name: string;
  path: string;
  dir: boolean;
  depth: number;
}

export interface VaultTreeResp {
  vaultDir: string;
  tree: VaultNode[];
}

// ---- Live system check (powers the terminal, IDE status bar, and meeting) ----

export type FleetState = "ready" | "config" | "offline";

export interface FleetAgentLine {
  id: string;
  name: string;
  accent: string;
  glyph: string;
  state: FleetState;
  version: string | null;
  sessions: number;
}

export interface SystemReport {
  generatedAt: string;
  host: {
    platform: string;
    release: string;
    arch: string;
    hostname: string;
    type: string;
  };
  uptimeSec: number;
  node: string;
  cpu: { model: string; cores: number; speedMHz: number; usagePct: number };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usedPct: number };
  disk: {
    drive: string;
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPct: number;
  } | null;
  vault: {
    dir: string;
    exists: boolean;
    agentNotes: number;
    activityEntries: number;
    lastActivity: string | null;
  };
  fleet: {
    total: number;
    ready: number;
    config: number;
    offline: number;
    sessions: number;
    lastActive: string | null;
    agents: FleetAgentLine[];
  };
}

// ---- Team meeting boardroom ----

export type MeetingPhase =
  | "open"
  | "status"
  | "concern"
  | "suggestion"
  | "question"
  | "close"
  | "reply";

export interface MeetingTurn {
  id: string;
  agentId: string;
  name: string;
  accent: string;
  glyph: string;
  role: string;
  phase: MeetingPhase;
  text: string;
}

export interface MeetingMetric {
  label: string;
  value: string;
  tone: "ok" | "warn" | "crit" | "neutral";
}

export interface MeetingRosterEntry {
  id: string;
  name: string;
  accent: string;
  glyph: string;
  role: string;
  state: FleetState;
  /** True for the chair (Claude) and co-chair (jcode). */
  chair?: boolean;
}

export interface MeetingResp {
  generatedAt: string;
  metrics: MeetingMetric[];
  roster: MeetingRosterEntry[];
  turns: MeetingTurn[];
}

export interface MeetingReplyResp {
  turns: MeetingTurn[];
}
