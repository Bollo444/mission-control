"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentDetail } from "@/lib/types";
import { hexA } from "@/lib/format";
import { StatusPill, ExternalLink } from "@/components/ui";
import AgentLogo from "@/components/AgentLogo";
import { ClaudeBg } from "@/components/skins/backgrounds";
import GrowthSwarm from "./GrowthSwarm";

/* ------------------------------------------------------------------ *
 * Claude Code's dedicated surface — the official Anthropic identity.  *
 * Warm charcoal + the coral starburst, a modern app-shell like the    *
 * Hermes console (not a bare log-style terminal). Left: the real      *
 * native Claude Code TUI. Right: capabilities + quick prompts that    *
 * type straight into the live TUI. The Growth Swarm audit lives one   *
 * tab away.                                                           *
 * ------------------------------------------------------------------ */

const CL = {
  base: "#100d0a",
  surface: "#171310",
  surface2: "#1e1915",
  line: "#322a20",
  coral: "#d97757",
  coralBright: "#e8916f",
  ink: "#f5ede4",
  inkDim: "#c9b8a6",
};

const ACCENT = CL.coral;

const ClaudeTerminal = dynamic(() => import("@/components/ide/NativeTerminal"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm" style={{ color: CL.inkDim }}>
      booting the Claude Code TUI…
    </div>
  ),
});

const QUICK_PROMPTS = [
  "explain this repo in 3 sentences",
  "find and fix any TODO or FIXME in the current directory",
  "write a test for the main entry point",
  "review the last commit for bugs",
];

type TabId = "session" | "growth";

export default function ClaudeConsole({ agent }: { agent: AgentDetail }) {
  const a = agent;
  const [tab, setTab] = useState<TabId>("session");
  const [sent, setSent] = useState(0);

  // Type a quick prompt straight into the live native TUI session.
  const run = useCallback((prompt: string) => {
    const p = prompt.trim();
    if (!p) return;
    void fetch("/api/hermes/pty", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: "claude-main", type: "input", data: `${p}\r` }),
    }).catch(() => {});
    setSent((n) => n + 1);
  }, []);

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        background: `radial-gradient(1100px 480px at 78% -8%, ${hexA(CL.coral, 0.1)}, transparent 60%), ${CL.base}`,
        color: CL.ink,
      }}
    >
      {/* Hairline frame — the premium tell. */}
      <div className="pointer-events-none absolute inset-2 rounded-2xl" style={{ boxShadow: `inset 0 0 0 1px ${CL.line}` }} />

      {/* Hero — official starburst, fleet-uniform layout. */}
      <header className="relative z-10 shrink-0 overflow-hidden" style={{ borderBottom: `1px solid ${CL.line}` }}>
        <ClaudeBg className="opacity-60" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(16,13,10,0.94) 0%, rgba(16,13,10,0.62) 48%, rgba(16,13,10,0.2) 100%)",
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5 px-8 py-6">
          <div className="flex items-center gap-5">
            <div className="relative grid shrink-0 place-items-center">
              {/* coral glow radiating off the starburst */}
              <span
                aria-hidden
                className="pointer-events-none absolute h-28 w-28 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${hexA(CL.coral, 0.45)}, ${hexA(CL.coral, 0.1)} 45%, transparent 72%)`,
                  filter: "blur(6px)",
                  animation: "mc-breathe 3.6s ease-in-out infinite",
                }}
              />
              <span
                className="mc-anim-float relative grid h-20 w-20 place-items-center rounded-2xl"
                style={{ background: hexA(CL.coral, 0.1), boxShadow: `inset 0 0 0 1px ${hexA(CL.coral, 0.35)}` }}
              >
                <AgentLogo id="claude" size={64} />
              </span>
            </div>
            <div className="min-w-0">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: CL.coral }}>
                Anthropic · agentic coding CLI
              </div>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ color: CL.ink }}>
                Claude Code
              </h1>
              <p className="mt-1 max-w-2xl text-sm" style={{ color: CL.inkDim }}>
                {a.tagline}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <StatusPill on={a.status.installed} labelOn="ready" accent={CL.coral} />
            </div>
            <div className="text-xs" style={{ color: CL.inkDim }}>
              {a.status.version || (a.status.installed ? "configured" : "not detected")}
            </div>
            {a.homepage && <ExternalLink href={a.homepage}>{a.homepage.replace(/^https?:\/\//, "")}</ExternalLink>}
          </div>
        </div>
      </header>

      {/* Tab bar */}
      <nav
        className="relative z-10 flex shrink-0 items-end gap-1 px-6"
        style={{ borderBottom: `1px solid ${CL.line}`, background: CL.surface }}
        aria-label="Claude Code panel tabs"
      >
        {(
          [
            ["session", "New Session"],
            ["growth", "Growth Swarm"],
          ] as [TabId, string][]
        ).map(([id, label]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="relative px-4 py-2.5 text-sm font-medium transition-colors"
              style={active ? { color: CL.coral } : { color: CL.inkDim }}
            >
              {label}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-t" style={{ background: CL.coral }} />}
            </button>
          );
        })}
      </nav>

      {/* Body */}
      <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
        <div className="h-full" style={{ display: tab === "session" ? undefined : "none" }}>
          <div className="grid h-full min-h-0 grid-cols-1 gap-5 px-6 py-5 lg:grid-cols-[1fr_320px]">
            {/* Native TUI — the real Claude Code CLI, live on load. */}
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl" style={{ border: `1px solid ${CL.line}`, background: CL.base }}>
              <div className="flex shrink-0 items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${CL.line}`, background: CL.surface }}>
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: CL.coral }}>
                  <span className="h-3 w-1 rounded-full" style={{ background: CL.coral }} />
                  Native Claude Code TUI
                </div>
                <span className="font-mono text-[11px]" style={{ color: CL.inkDim }}>
                  live PTY · survives navigation
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <ClaudeTerminal kind="claude" session="claude-main" accent={ACCENT} />
              </div>
            </section>

            {/* Right rail */}
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
              <div className="rounded-xl p-4" style={{ border: `1px solid ${CL.line}`, background: CL.surface }}>
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: CL.inkDim }}>
                  Quick prompts
                </div>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      onClick={() => run(q)}
                      className="rounded-lg px-3 py-2 text-left text-sm transition-colors hover:brightness-110"
                      style={{ background: hexA(CL.coral, 0.1), color: CL.ink, border: `1px solid ${hexA(CL.coral, 0.3)}` }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
                {sent > 0 && (
                  <div className="mt-2 font-mono text-[11px]" style={{ color: CL.inkDim }}>
                    {sent} prompt{sent > 1 ? "s" : ""} sent to the live TUI
                  </div>
                )}
              </div>

              <div className="rounded-xl p-4" style={{ border: `1px solid ${CL.line}`, background: CL.surface }}>
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: CL.inkDim }}>
                  Capabilities
                </div>
                <div className="flex flex-col gap-1.5">
                  {a.tools.map((t) => (
                    <div key={t} className="flex items-center gap-2 text-sm" style={{ color: CL.ink }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: CL.coral }} />
                      {t}
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>

        {tab === "growth" && (
          <div className="h-full overflow-y-auto px-6 py-5">
            <GrowthSwarm />
          </div>
        )}
      </div>
    </div>
  );
}
