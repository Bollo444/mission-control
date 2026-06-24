"use client";

import { useEffect, useState } from "react";
import type { SessionsResp, Session } from "./types";

const OX = {
  base: "#08080a",
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface TranscriptMessage {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
  timestamp: number | null;
}

function roleColor(role: string): string {
  if (role === "user") return OX.gold;
  if (role === "assistant") return "#7be0d0";
  if (role === "tool") return "#9d8cff";
  return OX.inkDim;
}

function TranscriptModal({
  session,
  onClose,
}: {
  session: Session;
  onClose: () => void;
}) {
  const [msgs, setMsgs] = useState<TranscriptMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/hermes/sessions/${encodeURIComponent(session.id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ messages: TranscriptMessage[] }>;
      })
      .then((d) => setMsgs(d.messages))
      .catch((e: Error) => setError(e.message));
  }, [session.id]);

  // Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        style={{ background: OX.surface, border: `1px solid ${OX.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-3"
          style={{ borderBottom: `1px solid ${OX.line}` }}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" style={{ color: OX.ink }}>
              {session.title || "untitled session"}
            </div>
            <div className="text-[11px]" style={{ color: OX.inkDim }}>
              {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""} · {session.model}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold"
            style={{ background: OX.surface2, color: OX.inkDim, border: `1px solid ${OX.line}` }}
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="py-4 text-center text-xs" style={{ color: "#e05c5c" }}>
              ⚠ {error}
            </p>
          )}
          {!error && msgs === null && (
            <p className="py-4 text-center text-xs" style={{ color: OX.inkDim }}>
              Loading transcript…
            </p>
          )}
          {!error && msgs !== null && msgs.length === 0 && (
            <p className="py-4 text-center text-xs" style={{ color: OX.inkDim }}>
              No messages in this session.
            </p>
          )}
          {msgs?.map((m) => (
            <div key={m.id} className="mb-3">
              <div
                className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: roleColor(m.role) }}
              >
                {m.toolName ? `${m.role} · ${m.toolName}` : m.role}
              </div>
              <pre
                className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed"
                style={{ color: OX.ink, margin: 0 }}
              >
                {m.content || "—"}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  onOpen,
}: {
  session: Session;
  onOpen: (s: Session) => void;
}) {
  const isSubagent = Boolean(session.parentSessionId);

  return (
    <button
      onClick={() => onOpen(session)}
      className="flex w-full items-start gap-2.5 py-2.5 text-left transition-colors hover:bg-[rgba(245,183,90,0.06)]"
      title="Open transcript"
      style={{
        borderBottom: `1px solid ${OX.line}`,
        paddingLeft: isSubagent ? "16px" : undefined,
      }}
    >
      {isSubagent && (
        <div
          className="mt-1 shrink-0 h-3 w-3 rounded-sm text-[8px] grid place-items-center font-bold"
          style={{ background: "rgba(245,183,90,0.15)", color: OX.gold, border: `1px solid rgba(245,183,90,0.35)` }}
          title="subagent spawn"
        >
          ↳
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="truncate text-sm font-medium" style={{ color: OX.ink }}>
            {session.title || "untitled"}
          </span>
          {isSubagent && (
            <span
              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "rgba(245,183,90,0.12)", color: OX.gold, border: `1px solid rgba(245,183,90,0.30)` }}
            >
              subagent
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px]" style={{ color: OX.inkDim }}>
            {relativeTime(session.startedAt)}
          </span>
          <span style={{ color: OX.line }}>·</span>
          <span className="text-[11px]" style={{ color: OX.inkDim }}>
            {session.messageCount} msg{session.messageCount !== 1 ? "s" : ""}
          </span>
          <span style={{ color: OX.line }}>·</span>
          <span
            className="font-mono text-[11px]"
            style={{ color: OX.inkDim }}
          >
            {session.model}
          </span>
        </div>
      </div>
    </button>
  );
}

export default function SessionsPanel() {
  const [data, setData] = useState<SessionsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Session | null>(null);

  useEffect(() => {
    fetch("/api/hermes/sessions")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SessionsResp>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
      <div
        className="px-4 py-2.5"
        style={{ borderBottom: `1px solid ${OX.line}` }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: OX.inkDim }}
        >
          Sessions
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto px-4">
        {loading && (
          <p className="py-4 text-center text-xs" style={{ color: OX.inkDim }}>
            Loading…
          </p>
        )}
        {error && (
          <p className="py-4 text-center text-xs" style={{ color: "#e05c5c" }}>
            ⚠ {error}
          </p>
        )}
        {!loading && !error && data && data.sessions.length === 0 && (
          <p className="py-4 text-center text-xs" style={{ color: OX.inkDim }}>
            No sessions yet.
          </p>
        )}
        {!loading &&
          !error &&
          data &&
          data.sessions.map((s) => (
            <SessionRow key={s.id} session={s} onOpen={setOpen} />
          ))}
      </div>
      {open && <TranscriptModal session={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
