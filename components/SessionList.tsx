"use client";

import type { SessionMeta } from "@/lib/types";
import { relTime } from "@/lib/format";

export default function SessionList({
  sessions,
  accentFor,
  showAgent,
}: {
  sessions: SessionMeta[];
  accentFor: (id: string) => string;
  showAgent?: boolean;
}) {
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
          <div
            key={`${s.agentId}:${s.path}`}
            className="flex items-center gap-3 bg-[var(--color-surface)] px-4 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
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
          </div>
        );
      })}
    </div>
  );
}
