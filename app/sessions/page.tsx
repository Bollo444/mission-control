"use client";

import { useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { SessionMeta, AgentsResp } from "@/lib/types";
import { PageHeader, Screen, Stat } from "@/components/ui";
import SessionList from "@/components/SessionList";
import { hexA } from "@/lib/format";

interface SessResp {
  sessions: SessionMeta[];
  total: number;
}

export default function SessionsPage() {
  const { data } = useFetch<SessResp>("/api/sessions", 12000);
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 0);
  const [filter, setFilter] = useState<string>("all");

  const agents = agentsData?.agents ?? [];
  const accentFor = useMemo(() => {
    const m = new Map(agents.map((a) => [a.id, a.accent]));
    return (id: string) => m.get(id) ?? "var(--color-signal)";
  }, [agents]);

  const sessions = data?.sessions ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of sessions) c[s.agentId] = (c[s.agentId] ?? 0) + 1;
    return c;
  }, [sessions]);

  const shown = filter === "all" ? sessions : sessions.filter((s) => s.agentId === filter);

  return (
    <Screen
      header={
        <PageHeader
        eyebrow="Unified history"
        title="Sessions"
        sub="Every agent's conversations and runs, aggregated from their own session stores into one searchable timeline."
        right={
          <div className="flex gap-8 rounded-xl border bg-[var(--color-surface)] px-6 py-4">
            <Stat value={sessions.length} label="sessions shown" />
            <Stat value={Object.keys(counts).length} label="active agents" />
          </div>
        }
        />
      }
    >
      <div className="px-8 py-7">
        <div className="mb-4 flex flex-wrap gap-2">
          <FilterChip
            label="All"
            count={sessions.length}
            active={filter === "all"}
            accent="var(--color-signal)"
            onClick={() => setFilter("all")}
          />
          {agents
            .filter((a) => (counts[a.id] ?? 0) > 0)
            .map((a) => (
              <FilterChip
                key={a.id}
                label={a.name}
                count={counts[a.id] ?? 0}
                active={filter === a.id}
                accent={a.accent}
                onClick={() => setFilter(a.id)}
              />
            ))}
        </div>

        <SessionList sessions={shown} accentFor={accentFor} showAgent />
      </div>
    </Screen>
  );
}

function FilterChip({
  label,
  count,
  active,
  accent,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: active ? hexA(accent, 0.14) : "var(--color-surface)",
        color: active ? accent : "var(--color-ink-3)",
        borderColor: active ? hexA(accent, 0.4) : "var(--color-line)",
      }}
    >
      {label}
      <span
        className="rounded-full px-1.5 text-[10px]"
        style={{ background: active ? hexA(accent, 0.2) : "var(--color-surface-3)" }}
      >
        {count}
      </span>
    </button>
  );
}
