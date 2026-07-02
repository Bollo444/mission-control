"use client";

import { useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { LogsResp, LogEvent, LogLevel } from "@/lib/types";
import { PageHeader, Screen } from "@/components/ui";
import { hexA } from "@/lib/format";

const SOURCE_COLOR: Record<string, string> = {
  system: "#6ea8fe",
  settings: "#9d8cff",
  agent: "#46e0d0",
  health: "#5cd6a0",
  gateway: "#f5a25a",
  vault: "#e879c7",
  background: "#f5b75a",
};
const sourceColor = (s: string) => SOURCE_COLOR[s] ?? "#aab1c2";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "#8a93a6",
  success: "#5cd6a0",
  warn: "#e0b341",
  error: "#ff6b6b",
};

const LEVELS: (LogLevel | "all")[] = ["all", "info", "success", "warn", "error"];

/** Military-style stamp: YYYY-MM-DD HH:MM:SS (24h, zero-padded). */
function hhmmss(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  return `${date} ${time}`;
}

export default function LogsPage() {
  const [source, setSource] = useState("all");
  const [level, setLevel] = useState<LogLevel | "all">("all");
  const [q, setQ] = useState("");
  const [live, setLive] = useState(true);

  const url = useMemo(() => {
    const p = new URLSearchParams({ limit: "500" });
    if (source !== "all") p.set("source", source);
    if (level !== "all") p.set("level", level);
    if (q.trim()) p.set("q", q.trim());
    return `/api/logs?${p.toString()}`;
  }, [source, level, q]);

  const { data, reload } = useFetch<LogsResp>(url, live ? 2500 : 0);
  const events = data?.events ?? [];
  const sources = data?.sources ?? [];

  async function clearAll() {
    if (!window.confirm("Clear the entire Mission Control log?")) return;
    await fetch("/api/logs", { method: "DELETE" });
    reload();
  }

  return (
    <Screen
      header={
        <PageHeader
          eyebrow="Observability"
          title="Logs"
          sub="A universal, time-ordered record of everything happening inside Mission Control — settings, health sweeps, failovers, the gateway, agent activity, and more."
          right={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLive((v) => !v)}
                className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--color-surface-3)]"
                style={live ? { borderColor: hexA("#5cd6a0", 0.5), color: "#5cd6a0" } : { color: "var(--color-ink-3)" }}
                title="Auto-refresh every 2.5s"
              >
                {live ? "● Live" : "॥ Paused"}
              </button>
              <button
                onClick={() => reload()}
                className="rounded-lg border px-3 py-2 text-sm font-medium text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)]"
              >
                ↻
              </button>
              <button
                onClick={clearAll}
                className="rounded-lg border px-3 py-2 text-sm font-medium text-[var(--color-ink-4)] transition-colors hover:border-[#ff6b6b] hover:text-[#ff6b6b]"
              >
                Clear
              </button>
            </div>
          }
        />
      }
    >
      <div className="flex h-full flex-col px-8 py-5">
        {/* filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Select
            value={source}
            onChange={setSource}
            options={["all", ...sources].map((s) => ({ value: s, label: s === "all" ? "All sources" : s }))}
          />
          <Select
            value={level}
            onChange={(v) => setLevel(v as LogLevel | "all")}
            options={LEVELS.map((l) => ({ value: l, label: l === "all" ? "All levels" : l }))}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events…"
            className="min-w-0 flex-1 rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-ink-4)]"
          />
          <span className="text-xs text-[var(--color-ink-4)]">{events.length} shown</span>
        </div>

        {/* log stream */}
        <div className="mc-panel min-h-0 flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-[var(--color-ink-4)]">
              {data ? "No events match." : "Loading…"}
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-line-soft)]">
              {events.map((e, i) => (
                <Row key={`${e.ts}-${i}`} e={e} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Screen>
  );
}

function Row({ e }: { e: LogEvent }) {
  const sc = sourceColor(e.source);
  const lc = LEVEL_COLOR[e.level] ?? "#8a93a6";
  const agent = typeof e.meta?.agentName === "string" ? (e.meta.agentName as string) : undefined;
  return (
    <div className="flex items-start gap-3 px-4 py-1.5 font-mono text-xs leading-relaxed hover:bg-[var(--color-surface-2)]">
      <span className="shrink-0 tabular-nums text-[var(--color-ink-4)]" title={new Date(e.ts).toLocaleString()}>
        {hhmmss(e.ts)}
      </span>
      <span
        className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: hexA(sc, 0.14), color: sc, minWidth: 64, textAlign: "center" }}
      >
        {e.source}
      </span>
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: lc }} title={e.level} />
      <span className="min-w-0 flex-1">
        <span style={{ color: e.level === "error" ? lc : "var(--color-ink-2)" }}>{e.event}</span>
        {e.detail && <span className="text-[var(--color-ink-4)]"> · {e.detail}</span>}
        {agent && <span className="text-[var(--color-ink-4)]"> [{agent}]</span>}
      </span>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-ink-4)]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[var(--color-surface-2)]">
          {o.label}
        </option>
      ))}
    </select>
  );
}
