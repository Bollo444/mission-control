"use client";

import { useEffect, useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { MemoryResp, AgentsResp } from "@/lib/types";
import { PageHeader, Screen, Stat } from "@/components/ui";
import ActivityFeed from "@/components/ActivityFeed";
import SharedEditor from "@/components/SharedEditor";
import MemorySwarm, { type SwarmMode } from "@/components/MemorySwarm";

type MemoryView = "list" | SwarmMode;

export default function MemoryPage() {
  const { data } = useFetch<MemoryResp>("/api/memory", 8000);
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 0);

  const agents = agentsData?.agents ?? [];
  const accentFor = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.accent]));
    return (id: string) => m.get(id) ?? "var(--color-signal)";
  }, [agents]);

  const activity = data?.activity ?? [];

  const [view, setView] = useState<MemoryView>("list");
  useEffect(() => {
    try {
      const v = localStorage.getItem("mc-memory-view");
      if (v === "list" || v === "neural" || v === "orbit" || v === "stream") setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("mc-memory-view", view);
    } catch {
      /* ignore */
    }
  }, [view]);

  return (
    <Screen
      header={
        <PageHeader
        eyebrow="Obsidian vault"
        title="Shared Memory Vault"
        sub="One vault, every agent. The activity feed is the live record of what each agent is doing; shared knowledge is the durable cross-agent brain."
        right={
          <div className="flex gap-8 rounded-xl border bg-[var(--color-surface)] px-6 py-4">
            <Stat value={activity.length} label="feed entries" />
            <Stat value={agents.length} label="agent notes" />
          </div>
        }
        />
      }
    >
      <div className="px-8 py-7">
        <div className="mb-6 rounded-xl border bg-[var(--color-surface-2)] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-ink-4)]">
            vault location · open as a vault in Obsidian
          </div>
          <code className="mt-1 block break-all font-mono text-xs text-[var(--color-ink-2)]">
            {data?.vaultDir ?? "…"}
          </code>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="mc-panel p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <span className="mc-live-dot h-2 w-2 rounded-full" style={{ background: "var(--color-green)" }} />
                Shared activity
              </h2>
              <div className="flex gap-0.5 rounded-lg border p-0.5 text-[11px]">
                {(["list", "neural", "orbit", "stream"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className="rounded-md px-2 py-1 capitalize transition-colors"
                    style={
                      view === v
                        ? { background: "rgba(70,224,208,0.16)", color: "var(--color-signal)" }
                        : { color: "var(--color-ink-4)" }
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {view === "list" ? (
              <div className="max-h-[58vh] overflow-auto pr-2">
                <ActivityFeed entries={activity} accentFor={accentFor} />
              </div>
            ) : (
              <div className="h-[58vh]">
                <MemorySwarm entries={activity} accentFor={accentFor} mode={view} />
              </div>
            )}
          </section>

          <section className="mc-panel p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <span style={{ color: "var(--color-signal)" }}>✦</span>
              Shared knowledge
            </h2>
            <SharedEditor initial={data?.shared ?? ""} />
          </section>
        </div>
      </div>
    </Screen>
  );
}
