"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useFetch } from "@/lib/useFetch";
import type { AgentSummary, ActivityEntry } from "@/lib/types";
import { relTime } from "@/lib/format";
import AgentCard from "@/components/AgentCard";
import ActivityFeed from "@/components/ActivityFeed";
import OverviewMetrics from "@/components/OverviewMetrics";
import { PageHeader, Screen, Stat } from "@/components/ui";

interface AgentsResp {
  agents: AgentSummary[];
  generatedAt: string;
}
interface MemoryResp {
  vaultDir: string;
  activity: ActivityEntry[];
}

export default function OverviewPage() {
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 8000);
  const { data: memData } = useFetch<MemoryResp>("/api/memory", 10000);

  const agents = agentsData?.agents ?? [];
  const accentFor = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.accent]));
    return (id: string) => m.get(id) ?? "var(--color-signal)";
  }, [agents]);

  const ready = agents.filter((a) => a.status.installed).length;
  const totalSessions = agents.reduce((n, a) => n + a.status.sessionCount, 0);
  const lastActive = agents
    .map((a) => a.status.lastActive)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;

  return (
    <Screen
      header={
        <PageHeader
        eyebrow="Fleet status"
        title="Mission Control"
        sub="One command center for every coding agent. Launch, route models, and share memory through a single Obsidian vault — so every agent knows what the others are doing."
        right={
          <div className="flex gap-8 rounded-xl border bg-[var(--color-surface)] px-6 py-4">
            <Stat value={ready} unit={`/ ${agents.length}`} label="agents ready" />
            <Stat value={totalSessions} label="sessions" />
            <Stat value={relTime(lastActive ?? null)} label="last active" />
          </div>
        }
        />
      }
    >
      <div className="grid grid-cols-1 gap-6 px-8 py-7 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-7">
          <OverviewMetrics />
          <section>
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">
              Coding Agents · dedicated mission control
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {agents.map((a, i) => (
                <AgentCard key={a.id} a={a} index={i} />
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="mc-panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Shared activity</h2>
              <Link
                href="/memory"
                className="text-[11px] text-[var(--color-signal)] hover:underline"
              >
                open vault →
              </Link>
            </div>
            <ActivityFeed
              entries={(memData?.activity ?? []).slice(0, 12)}
              accentFor={accentFor}
              compact
            />
          </div>

          <div className="mc-panel-2 p-5 text-sm">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <span style={{ color: "var(--color-signal)" }}>✦</span> Obsidian vault
            </div>
            <p className="text-xs leading-relaxed text-[var(--color-ink-3)]">
              Unified memory lives at:
            </p>
            <code className="mt-2 block break-all rounded-lg bg-[var(--color-surface)] px-2.5 py-2 font-mono text-[11px] text-[var(--color-ink-2)]">
              {memData?.vaultDir ?? "…"}
            </code>
            <p className="mt-2 text-[11px] text-[var(--color-ink-4)]">
              Open this folder as a vault in Obsidian to browse the agent graph.
            </p>
          </div>
        </aside>
      </div>
    </Screen>
  );
}
