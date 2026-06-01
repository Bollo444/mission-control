"use client";

import { useEffect, useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentDetail, SystemReport } from "@/lib/types";
import { fmtDuration, hexA, pctColor, relTime } from "@/lib/format";

/* Per-agent metric widgets. Each agent gets a DISTINCT default preset so no two
   tabs look alike, and the user can toggle/reorder widgets (saved per agent). */

interface Ctx {
  a: AgentDetail;
  sys: SystemReport | null;
}
interface Widget {
  id: string;
  label: string;
  bar?: boolean;
  get: (c: Ctx) => { value: React.ReactNode; sub?: string; pct?: number };
}

const CATALOG: Widget[] = [
  { id: "sessions", label: "sessions", get: ({ a }) => ({ value: a.status.sessionCount }) },
  { id: "configs", label: "configs", get: ({ a }) => ({ value: a.status.configs.filter((c) => c.exists).length }) },
  { id: "lastActive", label: "last active", get: ({ a }) => ({ value: relTime(a.status.lastActive) }) },
  { id: "version", label: "version", get: ({ a }) => ({ value: a.status.version ? a.status.version.split(" ").slice(-1)[0] : "—" }) },
  { id: "model", label: "routed model", get: ({ a }) => ({ value: a.route ? a.route.model.split("/").pop()! : "—", sub: a.route?.provider }) },
  { id: "provider", label: "provider", get: ({ a }) => ({ value: a.route?.provider ?? "—" }) },
  { id: "tools", label: "capabilities", get: ({ a }) => ({ value: a.tools.length }) },
  { id: "status", label: "status", get: ({ a }) => ({ value: a.status.binPath ? "ready" : a.status.hasConfig ? "config" : "offline" }) },
  { id: "cpu", label: "host cpu", bar: true, get: ({ sys }) => ({ value: sys ? `${sys.cpu.usagePct}%` : "…", pct: sys?.cpu.usagePct ?? 0, sub: sys ? `${sys.cpu.cores} cores` : undefined }) },
  { id: "mem", label: "host memory", bar: true, get: ({ sys }) => ({ value: sys ? `${sys.memory.usedPct}%` : "…", pct: sys?.memory.usedPct ?? 0 }) },
  { id: "disk", label: "host disk", bar: true, get: ({ sys }) => ({ value: sys?.disk ? `${sys.disk.usedPct}%` : "…", pct: sys?.disk?.usedPct ?? 0 }) },
  { id: "uptime", label: "host uptime", get: ({ sys }) => ({ value: sys ? fmtDuration(sys.uptimeSec) : "…" }) },
  { id: "cores", label: "cpu cores", get: ({ sys }) => ({ value: sys?.cpu.cores ?? "…" }) },
  { id: "fleetReady", label: "fleet ready", get: ({ sys }) => ({ value: sys ? `${sys.fleet.ready}/${sys.fleet.total}` : "…" }) },
  { id: "vaultActivity", label: "vault events", get: ({ sys }) => ({ value: sys?.vault.activityEntries ?? "…" }) },
];

const PRESETS: Record<string, string[]> = {
  claude: ["sessions", "model", "fleetReady", "vaultActivity"],
  hermes: ["sessions", "model", "uptime", "status"],
  pi: ["cpu", "mem", "disk", "cores"],
  opencode: ["provider", "model", "sessions", "status"],
  jcode: ["vaultActivity", "sessions", "fleetReady", "lastActive"],
  vibe: ["model", "provider", "mem", "sessions"],
  kilo: ["configs", "version", "model", "tools"],
};
const FALLBACK = ["sessions", "configs", "lastActive", "model"];

const presetFor = (id: string) => PRESETS[id] ?? FALLBACK;
const byId = (id: string) => CATALOG.find((w) => w.id === id);

export default function AgentMetrics({ agent }: { agent: AgentDetail }) {
  const { data: sys } = useFetch<SystemReport>("/api/system", 6000);
  const accent = agent.accent;
  const storeKey = `mc-metrics-${agent.id}`;
  const [ids, setIds] = useState<string[]>(() => presetFor(agent.id));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length) setIds(arr.filter((id) => byId(id)));
      }
    } catch {
      /* ignore */
    }
  }, [storeKey]);

  function persist(next: string[]) {
    setIds(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  const toggle = (id: string) => persist(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  function move(id: string, dir: -1 | 1) {
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const next = [...ids];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  }
  function reset() {
    try {
      localStorage.removeItem(storeKey);
    } catch {
      /* ignore */
    }
    setIds(presetFor(agent.id));
  }

  const ctx: Ctx = useMemo(() => ({ a: agent, sys: sys ?? null }), [agent, sys]);
  const widgets = ids.map(byId).filter(Boolean) as Widget[];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">
          Live metrics
        </span>
        <button
          onClick={() => setEditing((e) => !e)}
          className="rounded-md border px-2 py-0.5 text-[11px] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)]"
          style={editing ? { borderColor: hexA(accent, 0.5), color: accent } : undefined}
        >
          ⚙ customize
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {widgets.map((w) => {
          const r = w.get(ctx);
          const barCol = w.bar && r.pct != null ? pctColor(r.pct) : accent;
          return (
            <div key={w.id} className="overflow-hidden rounded-xl border bg-[var(--color-surface-2)] px-3.5 py-3">
              <div className="mc-stat-value truncate text-xl leading-none" style={{ color: barCol }}>
                {r.value}
              </div>
              {w.bar && r.pct != null && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full" style={{ width: `${r.pct}%`, background: barCol }} />
                </div>
              )}
              <div className="mt-1.5 text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">
                {w.label}
                {r.sub ? <span className="ml-1 normal-case text-[var(--color-ink-4)]">· {r.sub}</span> : null}
              </div>
            </div>
          );
        })}
        {widgets.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed px-3 py-4 text-center text-xs text-[var(--color-ink-4)]">
            No widgets — open customize to add some.
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 rounded-xl border border-dashed p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[var(--color-ink-2)]">Choose & order widgets</span>
            <button onClick={reset} className="text-[11px] text-[var(--color-ink-4)] hover:text-[var(--color-ink-2)]">
              reset to preset
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {CATALOG.map((w) => {
              const on = ids.includes(w.id);
              const pos = ids.indexOf(w.id);
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px]"
                  style={{ background: on ? hexA(accent, 0.08) : "transparent" }}
                >
                  <button
                    onClick={() => toggle(w.id)}
                    className="grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px]"
                    style={{
                      background: on ? accent : "transparent",
                      borderColor: on ? accent : "var(--color-line)",
                      color: "#0b0c0f",
                    }}
                  >
                    {on ? "✓" : ""}
                  </button>
                  <span className="flex-1 truncate text-[var(--color-ink-2)]">{w.label}</span>
                  {on && (
                    <span className="flex shrink-0 gap-0.5">
                      <button
                        onClick={() => move(w.id, -1)}
                        disabled={pos <= 0}
                        className="rounded px-1 text-[var(--color-ink-4)] hover:text-[var(--color-ink)] disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => move(w.id, 1)}
                        disabled={pos >= ids.length - 1}
                        className="rounded px-1 text-[var(--color-ink-4)] hover:text-[var(--color-ink)] disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
