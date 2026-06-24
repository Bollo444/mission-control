"use client";

import { useCallback, useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { HATS } from "@/lib/sentinel-hats";

/* ------------------------------------------------------------------ *
 * Sentinel hat swarm — pick an objective + which security hats, fire   *
 * them in parallel as headless sub-agents, watch their findings stream.*
 * ------------------------------------------------------------------ */

interface Run {
  id: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt: number | null;
  output: string;
  label?: string;
}

const ACCENT = "#d65db1";

function statusColor(s: Run["status"]): string {
  if (s === "running") return "#f5b75a";
  if (s === "done") return "#3ad07a";
  return "#ff6b6b";
}

function RunCard({ run }: { run: Run }) {
  const [open, setOpen] = useState(false);
  const hat = HATS.find((h) => `${h.name} hat` === run.label);
  const color = hat?.color ?? ACCENT;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
        >
          {run.label ?? "run"}
        </span>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: statusColor(run.status), boxShadow: `0 0 6px ${statusColor(run.status)}` }}
          title={run.status}
        />
        <span className="text-[11px] text-[var(--color-ink-4)]">{run.status}</span>
        <span className="ml-auto text-[11px] text-[var(--color-ink-4)]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words border-t border-white/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-ink-2)]">
          {run.output?.trim() || (run.status === "running" ? "working…" : "(no output)")}
        </pre>
      )}
    </div>
  );
}

export default function SentinelSwarm() {
  const [objective, setObjective] = useState("");
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(["red", "blue", "purple"])
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, reload } = useFetch<{ runs: Run[] }>("/api/subagents", 4000);
  const hatRuns = useMemo(
    () => (data?.runs ?? []).filter((r) => r.label?.endsWith("hat")),
    [data]
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const deploy = useCallback(async () => {
    setErr(null);
    if (!objective.trim()) { setErr("Enter an objective."); return; }
    if (selected.size === 0) { setErr("Pick at least one hat."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/sentinel/swarm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective, hats: [...selected] }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "deploy failed");
      else reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [objective, selected, reload]);

  return (
    <section className="mc-panel p-5">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color: ACCENT }}>⬡ Hat Swarm</span>
        <span className="text-[11px] text-[var(--color-ink-4)]">
          parallel security hats over the 754 playbooks · authorized targets only
        </span>
      </div>

      <textarea
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        rows={2}
        placeholder="Objective — e.g. assess the auth service at 10.0.0.5 (authorized)…"
        className="mt-2 w-full resize-y rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-ink-4)]"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {HATS.map((h) => {
          const on = selected.has(h.id);
          return (
            <button
              key={h.id}
              onClick={() => toggle(h.id)}
              title={h.lens}
              className="rounded-full px-3 py-1 text-xs font-semibold transition-transform hover:-translate-y-px"
              style={{
                background: on ? `${h.color}26` : "transparent",
                color: on ? h.color : "var(--color-ink-4)",
                border: `1px solid ${on ? `${h.color}88` : "rgba(255,255,255,0.12)"}`,
              }}
            >
              {h.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={deploy}
          disabled={busy || !objective.trim() || selected.size === 0}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-transform hover:-translate-y-px disabled:opacity-40"
          style={{ background: ACCENT, color: "#1a0f17" }}
        >
          {busy ? "Deploying…" : `Deploy ${selected.size} hat${selected.size !== 1 ? "s" : ""}`}
        </button>
        {err && <span className="text-xs text-[var(--color-rose)]">⚠ {err}</span>}
      </div>

      {hatRuns.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-4)]">
            Swarm activity
          </div>
          {hatRuns.slice(0, 24).map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </div>
      )}
    </section>
  );
}
