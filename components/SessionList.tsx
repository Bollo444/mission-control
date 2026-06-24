"use client";

import { useEffect, useState } from "react";
import type { SessionMeta } from "@/lib/types";
import { relTime } from "@/lib/format";

interface ConvMessage { role: string; text: string }

function roleColor(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("user")) return "var(--color-signal)";
  if (r.includes("assistant") || r.includes("model")) return "#7be0d0";
  if (r.includes("tool") || r.includes("system")) return "#9d8cff";
  return "var(--color-ink-4)";
}

function ConversationModal({ session, onClose }: { session: SessionMeta; onClose: () => void }) {
  const [msgs, setMsgs] = useState<ConvMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/content?path=${encodeURIComponent(session.path)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setMsgs(j.messages ?? [])))
      .catch((e: Error) => setError(e.message));
  }, [session.path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div
        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--color-ink)]">{session.title}</div>
            <div className="truncate font-mono text-[11px] text-[var(--color-ink-4)]">{session.agentId} · {session.id}</div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg border px-2.5 py-1 text-xs font-semibold text-[var(--color-ink-3)]">Close</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="py-4 text-center text-xs text-[var(--color-rose)]">⚠ {error}</p>}
          {!error && msgs === null && <p className="py-4 text-center text-xs text-[var(--color-ink-4)]">Loading conversation…</p>}
          {!error && msgs?.length === 0 && <p className="py-4 text-center text-xs text-[var(--color-ink-4)]">No readable messages in this session.</p>}
          {msgs?.map((m, i) => (
            <div key={i} className="mb-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: roleColor(m.role) }}>{m.role}</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-[var(--color-ink)]" style={{ margin: 0 }}>{m.text}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SessionList({
  sessions,
  accentFor,
  showAgent,
}: {
  sessions: SessionMeta[];
  accentFor: (id: string) => string;
  showAgent?: boolean;
}) {
  const [open, setOpen] = useState<SessionMeta | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-[var(--color-ink-4)]">
        No sessions found yet.
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y overflow-hidden rounded-xl border">
      {sessions.map((s) => {
        const accent = accentFor(s.agentId);
        return (
          <button
            key={`${s.agentId}:${s.path}`}
            onClick={() => setOpen(s)}
            title="Open conversation"
            className="flex w-full items-center gap-3 bg-[var(--color-surface)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-surface-2)]"
          >
            {showAgent && (
              <span
                className="grid h-7 w-16 shrink-0 place-items-center rounded-md text-[10px] font-semibold uppercase"
                style={{ background: `${accent}22`, color: accent }}
              >
                {s.agentId}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-[var(--color-ink)]">{s.title}</div>
              <div className="truncate font-mono text-[11px] text-[var(--color-ink-4)]">
                {s.project ? `${s.project} · ` : ""}
                {s.id}
              </div>
            </div>
            <div className="hidden shrink-0 text-right sm:block">
              <div className="mc-stat-value text-sm">
                {s.messages ?? "—"}
                <span className="ml-1 text-[10px] text-[var(--color-ink-4)]">msg</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-xs text-[var(--color-ink-2)]">{relTime(s.mtime)}</div>
              <div className="text-[10px] text-[var(--color-ink-4)]">{s.sizeKB} KB</div>
            </div>
          </button>
        );
      })}
      {open && <ConversationModal session={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
