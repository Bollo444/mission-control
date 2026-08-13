"use client";

import { useCallback, useEffect, useState } from "react";
import type { DelegationTask } from "@/lib/DelegationTask";
import { hexA } from "@/lib/format";

const STATE_META: Record<
  DelegationTask["state"],
  { label: string; color: string }
> = {
  proposed: { label: "Proposed", color: "#6ea8fe" },
  declined: { label: "Declined", color: "#f04d8b" },
  running: { label: "Running", color: "#f5b75a" },
  done: { label: "Done", color: "#5cd6a0" },
  error: { label: "Error", color: "#ff4438" },
};

const TARGETS = ["hermes", "claude", "pi", "cline", "antigravity", "openclaw", "jcode", "vibe", "codex"];

function fmt(iso?: string): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface ListResp {
  tasks: DelegationTask[];
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<DelegationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DelegationTask | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // create form
  const [summary, setSummary] = useState("");
  const [taskText, setTaskText] = useState("");
  const [target, setTarget] = useState("jcode");
  const [successCriteria, setSuccessCriteria] = useState("");
  const [scope, setScope] = useState({ write: false, vault: false, gateway: false, shell: false });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orchestrator", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ListResp;
      setTasks(json.tasks);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000); // live poll — status streams in real time
    return () => clearInterval(t);
  }, [load]);

  const act = useCallback(
    async (id: string, path: string) => {
      setBusyId(id);
      try {
        const res = await fetch(`/api/orchestrator/${id}/${path}`, {
          method: "POST",
          cache: "no-store",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok && json?.error) throw new Error(json.error);
        await load();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const create = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!summary.trim() || !taskText.trim()) return;
      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: summary.trim(),
            task: taskText.trim(),
            target,
            proposedBy: "user",
            successCriteria: successCriteria.trim() || undefined,
            scope,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        setSummary("");
        setTaskText("");
        setSuccessCriteria("");
        setScope({ write: false, vault: false, gateway: false, shell: false });
        setShowCreate(false);
        await load();
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [summary, taskText, target, successCriteria, scope, load]
  );

  const byState = (s: DelegationTask["state"]) => tasks.filter((t) => t.state === s);
  const counts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.state] = (acc[t.state] ?? 0) + 1;
    return acc;
  }, {});

  if (loading && tasks.length === 0) {
    return <div className="p-8 text-sm text-[var(--color-ink-4)]">Loading delegation tasks…</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--color-ink-3)]">
          {error && <span className="rounded-md bg-[var(--color-red-soft,var(--color-surface-3))] px-2 py-1 text-[var(--color-ink-2)]">⚠ {error}</span>}
          {!error && <span className="mc-live-dot inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-green)" }} />}
          <span>{tasks.length} real task{tasks.length === 1 ? "" : "s"} in store</span>
          {Object.entries(counts).map(([s, n]) => (
            <span key={s} style={{ color: STATE_META[s as DelegationTask["state"]].color }}>
              {STATE_META[s as DelegationTask["state"]].label} {n}
            </span>
          ))}
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:brightness-110"
          style={{ background: "var(--color-surface-3)", color: "var(--color-ink)" }}
        >
          {showCreate ? "Cancel" : "+ New delegation"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={create}
          className="mb-6 rounded-2xl border p-4"
          style={{ borderColor: "var(--color-surface-3)", background: "var(--color-surface-2,var(--color-surface))" }}
        >
          <div className="mb-3 grid gap-3 md:grid-cols-2">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Summary (one line, e.g. “Refactor auth middleware”)"
              className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-signal)]"
              style={{ borderColor: "var(--color-surface-3)" }}
            />
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="rounded-lg border bg-[var(--color-surface)] px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--color-surface-3)" }}
            >
              {TARGETS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <textarea
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="The actual instruction contract for the target agent…"
            rows={3}
            className="mb-3 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-signal)]"
            style={{ borderColor: "var(--color-surface-3)" }}
          />
          <input
            value={successCriteria}
            onChange={(e) => setSuccessCriteria(e.target.value)}
            placeholder="Success criteria (optional — “done when…”)"
            className="mb-3 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-signal)]"
            style={{ borderColor: "var(--color-surface-3)" }}
          />
          <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-[var(--color-ink-3)]">
            <span className="uppercase tracking-wider">Declared scope:</span>
            {(["write", "vault", "gateway", "shell"] as const).map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={scope[k]}
                  onChange={(e) => setScope((s) => ({ ...s, [k]: e.target.checked }))}
                  className="accent-[var(--color-signal)]"
                />
                {k}
              </label>
            ))}
            <span className="text-[var(--color-ink-4)]">(empty = fail-closed; the write-gate blocks)</span>
          </div>
          <button
            type="submit"
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
            style={{ background: "var(--color-signal)", color: "#0b0d10" }}
          >
            Create contract
          </button>
        </form>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {tasks.map((t) => {
          const meta = STATE_META[t.state];
          return (
            <div
              key={t.id}
              className="mc-glow-edge relative overflow-hidden rounded-2xl border p-4"
              style={{
                borderColor: "var(--color-surface-3)",
                background: "var(--color-surface)",
                ["--glow" as string]: hexA(meta.color, 0.35),
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--color-ink)" }}>
                    {t.summary}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-ink-4)]">
                    {t.id} · → {t.target} · {fmt(t.updatedAt)}
                  </div>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: hexA(meta.color, 0.14), color: meta.color }}
                >
                  {meta.label}
                </span>
              </div>

              <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-[var(--color-ink-3)]">
                {t.task}
              </p>

              {t.state === "proposed" && (
                <button
                  onClick={() => act(t.id, "decide")}
                  disabled={busyId === t.id}
                  className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-110 disabled:opacity-50"
                  style={{ background: hexA(meta.color, 0.16), color: meta.color }}
                >
                  {busyId === t.id ? "Target deciding…" : "Ask target (accept/decline)"}
                </button>
              )}
              {t.state === "running" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => act(t.id, "reconcile")}
                    disabled={busyId === t.id}
                    className="flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-110 disabled:opacity-50"
                    style={{ background: hexA(meta.color, 0.16), color: meta.color }}
                  >
                    {busyId === t.id ? "Syncing…" : "Poll run → report"}
                  </button>
                  <button
                    onClick={() => act(t.id, "dispatch")}
                    disabled={busyId === t.id}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-110 disabled:opacity-50"
                    style={{ background: "var(--color-surface-3)", color: "var(--color-ink-2)" }}
                  >
                    Dispatch
                  </button>
                </div>
              )}
              {(t.state === "declined" || t.state === "error" || t.state === "done") && (
                <button
                  onClick={() => setDetail(t)}
                  className="w-full rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-110"
                  style={{ background: "var(--color-surface-3)", color: "var(--color-ink-2)" }}
                >
                  View details
                </button>
              )}

              <div className="mt-3 space-y-1 text-[11px] text-[var(--color-ink-4)]">
                {t.acceptReason && <div>✓ accept: {t.acceptReason}</div>}
                {t.declineReason && <div>✗ decline: {t.declineReason}</div>}
                {t.accept_error && <div>❌ acceptance: {t.accept_error}</div>}
                {t.scope_error && <div>⛔ scope: {t.scope_error}</div>}
                {t.run_error && <div>⚠ run: {t.run_error}</div>}
                {t.run && (
                  <div>
                    run {t.run.status}
                    {t.run.exitCode !== null && t.run.exitCode !== undefined ? ` · exit ${t.run.exitCode}` : ""}
                    {t.run.output ? ` · ${t.run.output.length} chars` : ""}
                  </div>
                )}
                {t.report && <div className="line-clamp-2 text-[var(--color-ink-3)]">📋 {t.report.text}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {tasks.length === 0 && !loading && (
        <div className="mt-10 text-center text-sm text-[var(--color-ink-4)]">
          No delegation tasks yet — create one to start the two-hop loop.
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setDetail(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-6"
            style={{ borderColor: "var(--color-surface-3)", background: "var(--color-bg)" }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{detail.summary}</div>
                <div className="text-xs text-[var(--color-ink-4)]">
                  {detail.id} · → {detail.target} · created {fmt(detail.createdAt)}
                </div>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg px-2.5 py-1 text-sm hover:bg-[var(--color-surface-3)]"
              >
                ✕
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-xl p-4 text-[11px] leading-relaxed"
              style={{ background: "var(--color-surface-2,var(--color-surface))", color: "var(--color-ink-2)" }}
            >
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
