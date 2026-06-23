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

function SessionRow({ session }: { session: Session }) {
  const isSubagent = Boolean(session.parentSessionId);

  return (
    <div
      className="flex items-start gap-2.5 py-2.5"
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
    </div>
  );
}

export default function SessionsPanel() {
  const [data, setData] = useState<SessionsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
          data.sessions.map((s) => <SessionRow key={s.id} session={s} />)}
      </div>
    </div>
  );
}
