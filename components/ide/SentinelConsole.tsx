"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AgentDetail } from "@/lib/types";
import { hexA } from "@/lib/format";
import { getSkin } from "@/components/skins";
import SessionList from "@/components/SessionList";
import LaunchControls from "@/components/LaunchControls";
import SentinelSwarm from "@/components/ide/SentinelSwarm";

/* ------------------------------------------------------------------ *
 * Sentinel — the OpenSwarm security console. The real Agent Swarm TUI *
 * (the opencode/Claude-Code-style terminal harness) is the hero, in a *
 * dark violet operations deck. The in-house 8-hat delegation swarm    *
 * stays one tab away.                                                 *
 * ------------------------------------------------------------------ */

const V = {
  void: "#0a0610",
  violet: "#d65db1",
  violetBright: "#f2a7de",
  ink: "#f0e8f5",
  inkDim: "#9d87a8",
  line: "#2a1533",
};

const ACCENT = V.violet;

const SentinelTerminal = dynamic(() => import("@/components/ide/NativeTerminal"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm" style={{ color: V.inkDim }}>
      bringing the swarm online…
    </div>
  ),
});

type TabId = "tui" | "swarm" | "sessions" | "launch";

const TABS: { id: TabId; glyph: string; label: string }[] = [
  { id: "tui", glyph: "⌘", label: "OpenSwarm TUI" },
  { id: "swarm", glyph: "⬡", label: "Hat Swarm" },
  { id: "sessions", glyph: "⧉", label: "Sessions" },
  { id: "launch", glyph: "⚙", label: "Launch" },
];

export default function SentinelConsole({ agent }: { agent: AgentDetail }) {
  const a = agent;
  const [tab, setTab] = useState<TabId>("tui");
  const skin = getSkin(a.id);
  const { Mascot } = skin;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: V.void }}>
      {/* Ambient violet glow + scanline grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(110% 90% at 50% 0%, ${hexA(V.violet, 0.16)}, transparent 55%), radial-gradient(80% 60% at 85% 100%, ${hexA(V.violet, 0.08)}, transparent 60%)`,
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" aria-hidden>
        <defs>
          <pattern id="sgrid" width="42" height="42" patternUnits="userSpaceOnUse">
            <path d="M42 0 H0 V42" fill="none" stroke={V.violet} strokeOpacity="0.06" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#sgrid)" />
      </svg>

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: V.line }}>
        <div className="flex items-center gap-3.5">
          <span className="grid h-11 w-11 place-items-center" style={{ filter: `drop-shadow(0 0 12px ${hexA(V.violet, 0.55)})` }}>
            <Mascot size={44} />
          </span>
          <div className="leading-tight">
            <div className="font-mono text-sm font-semibold tracking-tight" style={{ color: V.ink }}>
              Sentinel
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: V.inkDim }}>
              Vigil · OpenSwarm security console
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right font-mono text-[11px] leading-tight" style={{ color: V.inkDim }}>
            <div style={{ color: a.status.installed ? V.violetBright : V.inkDim }}>
              {a.status.installed ? "● READY" : "○ OFFLINE"}
            </div>
            <div>{a.status.version || (a.status.installed ? "configured" : "not detected")}</div>
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav className="relative z-10 flex shrink-0 gap-1.5 border-b px-6 py-2.5" style={{ borderColor: V.line }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-[12px] transition-colors"
            style={{
              color: tab === t.id ? V.ink : V.inkDim,
              background: tab === t.id ? hexA(V.violet, 0.16) : "transparent",
              boxShadow: tab === t.id ? `inset 0 0 0 1px ${hexA(V.violet, 0.4)}` : undefined,
            }}
          >
            <span style={{ color: tab === t.id ? V.violetBright : V.inkDim }}>{t.glyph}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Body */}
      <main className="relative z-10 min-h-0 flex-1 p-6">
        {tab === "tui" &&
          (a.status.installed ? (
            <div className="flex h-full flex-col overflow-hidden rounded-2xl" style={{ boxShadow: `inset 0 0 0 1px ${hexA(V.violet, 0.35)}, 0 0 80px -28px ${hexA(V.violet, 0.55)}` }}>
              <div className="flex shrink-0 items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${V.line}`, background: "rgba(10,6,16,0.6)" }}>
                <div className="flex items-center gap-2 font-mono text-[12px] font-semibold" style={{ color: V.violetBright }}>
                  <span className="h-3 w-1 rounded-full" style={{ background: V.violet }} />
                  OpenSwarm · Agent Swarm TUI · live
                </div>
                <span className="font-mono text-[11px]" style={{ color: V.inkDim }}>
                  the real harness · survives navigation
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <SentinelTerminal kind="sentinel" session="sentinel-main" accent={ACCENT} transparent />
              </div>
            </div>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center">
              <div className="max-w-md text-sm leading-relaxed" style={{ color: V.inkDim }}>
                The OpenSwarm TUI appears here once the harness is installed.
                <br />
                Use the <span style={{ color: V.violetBright }}>Launch</span> tab to set it up.
              </div>
            </div>
          ))}

        {tab === "swarm" && (
          <div className="mx-auto h-full max-w-4xl overflow-y-auto rounded-2xl p-5" style={{ boxShadow: `inset 0 0 0 1px ${hexA(V.violet, 0.3)}`, background: "rgba(10,6,16,0.5)" }}>
            <SentinelSwarm />
          </div>
        )}

        {tab === "sessions" && (
          <div className="mx-auto h-full max-w-4xl overflow-y-auto rounded-2xl p-5" style={{ boxShadow: `inset 0 0 0 1px ${hexA(V.violet, 0.3)}`, background: "rgba(10,6,16,0.5)" }}>
            <SessionList sessions={a.sessions} accentFor={() => ACCENT} />
          </div>
        )}

        {tab === "launch" && (
          <div className="mx-auto max-w-2xl rounded-2xl p-5" style={{ boxShadow: `inset 0 0 0 1px ${hexA(V.violet, 0.3)}`, background: "rgba(10,6,16,0.5)" }}>
            <LaunchControls
              id={a.id}
              accent={ACCENT}
              kind={a.kind}
              installed={a.status.installed}
              installCommand={a.install?.command}
              installUnverified={a.install?.unverified}
              onActed={() => {}}
            />
            <p className="mt-4 font-mono text-[11px] leading-relaxed" style={{ color: V.inkDim }}>
              Launch opens the OpenSwarm Agent Swarm TUI in its own terminal window.
              First run walks you through creating a starter project; from then on it
              resumes your agency.
            </p>
            {a.status.binPath && (
              <div className="mt-3 break-all font-mono text-[11px]" style={{ color: V.inkDim }}>
                launcher · {a.status.binPath}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
