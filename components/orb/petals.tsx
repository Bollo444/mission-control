"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentsResp } from "@/lib/types";
import AgentCard from "@/components/AgentCard";

/* ------------------------------------------------------------------ *
 * The twelve compass petals — the orb's hidden menu.                   *
 * Top arc = Hermes' own capabilities. Bottom arc = the fleet.          *
 * Each petal reveals a REAL component in place over the dimmed orb;    *
 * heavy fleet pages are code-split so the orb paints instantly.        *
 * ------------------------------------------------------------------ */

const loading = (label: string) => (
  <div className="grid h-full place-items-center text-sm text-[var(--color-ink-3)]">
    summoning {label}…
  </div>
);

// Hermes sub-surfaces — already modular, embed directly.
const HermesTerminal = dynamic(() => import("@/components/ide/NativeTerminal"), {
  ssr: false,
  loading: () => loading("the Hermes TUI"),
});
const SkillsAndTools = dynamic(() => import("@/components/ide/hermes/SkillsAndTools"), {
  loading: () => loading("skills & tools"),
});
const ProfilesManager = dynamic(() => import("@/components/ide/hermes/ProfilesManager"), {
  loading: () => loading("profiles"),
});
const Artifacts = dynamic(() => import("@/components/ide/hermes/Artifacts"), {
  loading: () => loading("artifacts"),
});
const SessionsPanel = dynamic(() => import("@/components/ide/hermes/SessionsPanel"), {
  loading: () => loading("sessions"),
});

// Fleet pages — embed the real route components (none depend on route params).
const MemoryPage = dynamic(() => import("@/app/memory/page"), { loading: () => loading("the vault") });
const MeetingPage = dynamic(() => import("@/app/meeting/page"), { loading: () => loading("the boardroom") });
const AutomationPage = dynamic(() => import("@/app/automation/page"), { loading: () => loading("automation") });
const GatewayPage = dynamic(() => import("@/app/gateway/page"), { loading: () => loading("the backup generator") });
const LogsPage = dynamic(() => import("@/app/logs/page"), { loading: () => loading("the logbook") });

/** Live fleet roster — reuses the overview's AgentCard grid. */
function AgentsGrid() {
  const { data } = useFetch<AgentsResp>("/api/agents", 8000);
  const agents = data?.agents ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 xl:grid-cols-3">
      {agents.map((a, i) => (
        <AgentCard key={a.id} a={a} index={i} />
      ))}
    </div>
  );
}

export type PetalGroup = "hermes" | "fleet";

export interface Petal {
  id: string;
  glyph: string;
  label: string;
  group: PetalGroup;
  /** Position on the rim, degrees (0 = right, clockwise, screen y-down). */
  angle: number;
  /** Duo opens its own full overlay instead of a framed panel. */
  modal?: boolean;
  render: () => ReactNode;
}

// The native TUI gets generous height; the rest scroll inside the panel.
const TUI = () => (
  <div className="h-[78vh] px-6 py-5">
    <div className="h-full overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-base)]">
      <HermesTerminal kind="hermes" session="hermes-main" />
    </div>
  </div>
);

export const PETALS: Petal[] = [
  // ---- Top arc · Hermes (left → right) ----
  { id: "sessions", glyph: "⧉", label: "Sessions", group: "hermes", angle: 195, render: () => <div className="p-6"><SessionsPanel /></div> },
  { id: "profiles", glyph: "◬", label: "Profiles", group: "hermes", angle: 225, render: () => <ProfilesManager /> },
  { id: "skills", glyph: "⚒", label: "Skills & Tools", group: "hermes", angle: 255, render: () => <SkillsAndTools /> },
  { id: "console", glyph: "⌁", label: "Console", group: "hermes", angle: 285, render: TUI },
  { id: "duo", glyph: "⬡", label: "Duo flow", group: "hermes", angle: 315, modal: true, render: () => null },
  { id: "artifacts", glyph: "✶", label: "Artifacts", group: "hermes", angle: 345, render: () => <Artifacts /> },

  // ---- Bottom arc · Fleet (left → right) ----
  { id: "agents", glyph: "⊕", label: "Agents", group: "fleet", angle: 165, render: () => <AgentsGrid /> },
  { id: "memory", glyph: "✦", label: "Memory", group: "fleet", angle: 135, render: () => <MemoryPage /> },
  { id: "meeting", glyph: "❂", label: "Team Meeting", group: "fleet", angle: 105, render: () => <MeetingPage /> },
  { id: "automation", glyph: "⏱", label: "Automation", group: "fleet", angle: 75, render: () => <AutomationPage /> },
  { id: "gateway", glyph: "⇄", label: "Backup Generator", group: "fleet", angle: 45, render: () => <GatewayPage /> },
  { id: "logs", glyph: "▤", label: "Logs", group: "fleet", angle: 15, render: () => <LogsPage /> },
];
