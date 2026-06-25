"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentDetail, ActivityEntry, MemoryResp } from "@/lib/types";
import { hexA } from "@/lib/format";
import { StatusPill, Kind, ExternalLink } from "@/components/ui";
import LaunchControls from "@/components/LaunchControls";
import ConfigViewer from "@/components/ConfigViewer";
import MemoryEditor from "@/components/MemoryEditor";
import SessionList from "@/components/SessionList";
import ActivityFeed from "@/components/ActivityFeed";
import AgentMetrics from "@/components/AgentMetrics";
import NativeTerminal from "@/components/ide/NativeTerminal";
import ClaudeMascots from "@/components/ide/ClaudeMascots";
import VibeDog from "@/components/ide/VibeDog";
import SentinelSwarm from "@/components/ide/SentinelSwarm";
import { getSkin, typeFontClass } from "@/components/skins";
import AntigravityIde from "@/components/ide/AntigravityIde";
import OpenClawConsole from "@/components/ide/OpenClawConsole";
import HermesConsole from "@/components/ide/HermesConsole";
import CodexConsole from "@/components/ide/CodexConsole";

export default function AgentPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, reload } = useFetch<AgentDetail>(`/api/agents/${id}`, 9000);
  const { data: mem } = useFetch<MemoryResp>("/api/memory", 12000);

  const accentFor = useMemo(() => {
    const accent = data?.accent ?? "var(--color-signal)";
    return () => accent;
  }, [data?.accent]);

  if (error) {
    return (
      <div className="px-8 py-10 text-[var(--color-rose)]">Failed to load: {error}</div>
    );
  }
  if (!data) {
    return <div className="px-8 py-10 text-[var(--color-ink-4)]">Loading agent…</div>;
  }

  const a = data;
  const s = a.status;
  const accent = a.accent;
  const skin = getSkin(a.id);
  const { Mascot, Background } = skin;

  // Antigravity gets a wholly different surface: the integrated IDE.
  if (skin.ide) {
    return <AntigravityIde agent={a} />;
  }

  // OpenClaw gets its dedicated system-operations console.
  if (skin.console) {
    return <OpenClawConsole agent={a} />;
  }

  // Hermes gets its dedicated oxblood+gold console: native TUI + ACP relay.
  if (skin.hermes) {
    return <HermesConsole agent={a} />;
  }

  // Codex gets its dedicated noir "cipher" console: native TUI + plugins/MCP/etc.
  if (skin.codex) {
    return <CodexConsole agent={a} />;
  }

  const myActivity = (mem?.activity ?? []).filter((e: ActivityEntry) => e.agentId === a.id);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Skinned hero — unique background + animated mascot per agent */}
      <header className="relative min-h-[190px] shrink-0 overflow-hidden border-b">
        <Background />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(8,9,12,0.85) 0%, rgba(8,9,12,0.5) 48%, rgba(8,9,12,0.12) 100%)",
          }}
        />
        {a.id === "claude" && <ClaudeMascots />}
        {a.id === "vibe" && <VibeDog />}
        <div className="relative flex flex-wrap items-center justify-between gap-5 px-8 py-7">
          <div className="flex items-center gap-5">
            <span
              className="mc-anim-float grid h-20 w-20 shrink-0 place-items-center rounded-2xl"
              style={{
                background: hexA(accent, 0.1),
                boxShadow: `inset 0 0 0 1px ${hexA(accent, 0.35)}`,
              }}
            >
              <Mascot size={64} />
            </span>
            <div className="min-w-0">
              <div
                className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: accent }}
              >
                {skin.mood} · {a.kind} mission control
              </div>
              <h1
                className={`flex items-center gap-3 text-3xl font-semibold tracking-tight ${typeFontClass[skin.type]}`}
                style={skin.type === "serif" ? { letterSpacing: "0.01em" } : undefined}
              >
                {a.name}
                <Kind kind={a.kind} />
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-2)]">
                {a.tagline}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              {a.marketplace && (
                <a
                  href={a.marketplace}
                  target="_blank"
                  rel="noreferrer"
                  title={`${a.name} marketplace`}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-transform hover:-translate-y-px"
                  style={{
                    background: hexA(accent, 0.12),
                    color: accent,
                    boxShadow: `inset 0 0 0 1px ${hexA(accent, 0.35)}`,
                  }}
                >
                  ⊞ Marketplace
                </a>
              )}
              <StatusPill on={s.installed} labelOn="ready" accent={accent} />
            </div>
            <div className="text-xs text-[var(--color-ink-3)]">
              {s.version || (s.installed ? "configured" : "not detected")}
            </div>
            {a.homepage && (
              <ExternalLink href={a.homepage}>
                {a.homepage.replace(/^https?:\/\//, "")}
              </ExternalLink>
            )}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-6 px-8 py-7 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Main column — min-w-0 so the embedded xterm fits the track, not the reverse */}
        <div className="flex min-w-0 flex-col gap-6">
          {/* Launch + stats */}
          <section className="mc-panel p-5">
            <div className="mb-4">
              <AgentMetrics agent={a} />
            </div>
            <LaunchControls
              id={a.id}
              accent={accent}
              kind={a.kind}
              installed={s.installed}
              installCommand={a.install?.command}
              installUnverified={a.install?.unverified}
              onActed={reload}
            />
            {a.docsNote && (
              <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs text-[var(--color-ink-3)]">
                {a.docsNote}
              </p>
            )}
          </section>

          {/* Sentinel's parallel security hat swarm */}
          {a.id === "sentinel" && <SentinelSwarm />}

          {/* Tools */}
          <section className="mc-panel p-5">
            <SectionTitle accent={accent}>Tools & capabilities</SectionTitle>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {a.tools.map((t) => (
                <div
                  key={t}
                  className="flex items-center gap-2 rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: accent }}
                  />
                  {t}
                </div>
              ))}
            </div>
          </section>

          {/* Native harness — the agent's real CLI embedded, live on load.
              Only spawn when installed; otherwise a fresh clone would fire a
              failing PTY for a missing binary. Show an install hint instead. */}
          <section className="mc-panel overflow-hidden">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <SectionTitle accent={accent}>Native TUI · {a.name}</SectionTitle>
              <span className="text-[11px] text-[var(--color-ink-4)]">
                {s.installed ? `live ${a.id} session · survives navigation` : "not installed"}
              </span>
            </div>
            {s.installed ? (
              <div className="h-[28rem]">
                <NativeTerminal kind={a.id} session={`${a.id}-main`} accent={accent} />
              </div>
            ) : (
              <div className="grid h-56 place-items-center px-6 text-center">
                <div className="max-w-sm">
                  <p className="text-sm text-[var(--color-ink-3)]">
                    {a.name}&apos;s native TUI appears here once it&apos;s installed.
                  </p>
                  {a.install?.command && (
                    <code className="mt-3 block break-all rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-left font-mono text-[11px] text-[var(--color-ink-2)]">
                      {a.install.command}
                    </code>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Config */}
          <section className="mc-panel p-5">
            <SectionTitle accent={accent}>Configuration</SectionTitle>
            <p className="mb-3 text-xs text-[var(--color-ink-4)]">
              Live view of this agent&apos;s on-disk config.
            </p>
            <ConfigViewer configs={s.configs} accent={accent} />
            {s.binPath && (
              <div className="mt-3 break-all font-mono text-[11px] text-[var(--color-ink-4)]">
                binary · {s.binPath}
              </div>
            )}
          </section>

          {/* Sessions */}
          <section className="mc-panel p-5">
            <SectionTitle accent={accent}>Recent sessions</SectionTitle>
            <div className="mt-3">
              <SessionList sessions={a.sessions} accentFor={accentFor} />
            </div>
          </section>
        </div>

        {/* Right column: memory + activity */}
        <div className="flex flex-col gap-6">
          <section className="mc-panel p-5">
            <SectionTitle accent={accent}>Memory · Obsidian note</SectionTitle>
            <div className="mt-3">
              <MemoryEditor agentId={a.id} initial={a.memory} accent={accent} />
            </div>
          </section>

          <section className="mc-panel p-5">
            <SectionTitle accent={accent}>This agent&apos;s activity</SectionTitle>
            <div className="mt-3">
              <ActivityFeed entries={myActivity.slice(0, 10)} accentFor={accentFor} compact />
            </div>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
}

function SectionTitle({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold">
      <span className="h-3 w-1 rounded-full" style={{ background: accent }} />
      {children}
    </h2>
  );
}
