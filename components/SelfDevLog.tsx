"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { SelfDevLogEntry } from "@/lib/healer";

interface SelfDevLogProps {
  agentId: string;
  accent: string;
  limit?: number;
}

export default function SelfDevLog({ agentId, accent, limit = 200 }: SelfDevLogProps) {
  const { data, reload, error } = useFetch<{ entries: SelfDevLogEntry[] }>(
    `/api/healer/self-dev-log?agentId=${agentId}&limit=${limit}`,
    10000
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => reload(), 15000);
    return () => clearInterval(interval);
  }, [reload]);

  if (error) {
    return (
      <div className="text-xs text-[var(--color-rose)]">
        Failed to load self-dev log: {error}
      </div>
    );
  }

  const entries = data?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="text-xs text-[var(--color-ink-3)] italic py-4 text-center">
        No self-dev log entries yet. Hermes runs self-update checks via cron.
      </div>
    );
  }

  const actionColors: Record<SelfDevLogEntry["action"], string> = {
    check: "#64748b",
    update: "#3b82f6",
    rebuild: "#f59e0b",
    reload: "#8b5cf6",
    skip: "#10b981",
    error: "#ef4444",
  };

  const statusColors: Record<SelfDevLogEntry["status"], string> = {
    started: "#f59e0b",
    completed: "#10b981",
    failed: "#ef4444",
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
      {entries.map((e, i) => {
        const ts = new Date(e.ts).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        const isExpanded = expandedId === `${e.ts}-${i}`;
        const duration = formatDuration(e.detail.durationMs);

        return (
          <div
            key={`${e.ts}-${i}`}
            className="group relative rounded-lg border bg-[var(--color-surface-2)] p-3 hover:bg-[var(--color-surface-3)] transition-colors"
            style={{ borderColor: `${e.detail.triggeredBy === "cron" ? "var(--color-border)" : accent}40` }}
          >
            {/* Header row */}
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
                    style={{
                      background: `${actionColors[e.action]}20`,
                      color: actionColors[e.action],
                    }}
                  >
                    {e.action}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
                    style={{
                      background: `${statusColors[e.status]}20`,
                      color: statusColors[e.status],
                    }}
                  >
                    {e.status}
                  </span>
                  <span className="text-[var(--color-ink-4)]">{ts}</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
                    style={{
                      background: `var(--color-surface-3)`,
                      color: "var(--color-ink-3)",
                    }}
                  >
                    {e.detail.triggeredBy}
                  </span>
                  <span className="text-[var(--color-ink-4)] font-mono text-xs ml-auto">
                    {duration}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--color-ink-1)] font-mono">
                  {e.brief}
                </p>
              </div>
              <button
                onClick={() =>
                  setExpandedId(isExpanded ? null : `${e.ts}-${i}`)
                }
                className="flex-shrink-0 p-1 text-[var(--color-ink-4)] hover:text-[var(--color-ink-1)] transition-colors"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-1 text-[var(--color-ink-3)]">
                  <span>Component:</span>
                  <span className="font-mono text-[var(--color-ink-1)]">
                    {e.detail.component}
                  </span>
                  <span>Reason:</span>
                  <span className="font-mono text-[var(--color-ink-1)]">
                    {e.detail.reason}
                  </span>
                  {e.detail.previousVersion && (
                    <>
                      <span>Previous:</span>
                      <span className="font-mono text-[var(--color-ink-1)]">
                        {e.detail.previousVersion}
                      </span>
                    </>
                  )}
                  {e.detail.newVersion && (
                    <>
                      <span>New:</span>
                      <span className="font-mono text-[var(--color-ink-1)]">
                        {e.detail.newVersion}
                      </span>
                    </>
                  )}
                </div>
                {e.detail.steps.length > 0 && (
                  <div>
                    <p className="font-medium text-[var(--color-ink-2)] mb-1">Steps:</p>
                    <ol className="ml-4 space-y-0.5 list-decimal text-[var(--color-ink-3)]">
                      {e.detail.steps.map((step, si) => (
                        <li key={si} className="font-mono text-[10px]">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                {e.detail.output && (
                  <div>
                    <p className="font-medium text-[var(--color-ink-2)] mb-1">Output:</p>
                    <pre className="bg-[var(--color-surface-1)] rounded p-2 overflow-x-auto text-[10px] font-mono text-[var(--color-ink-3)] max-h-40 overflow-y-auto">
                      {e.detail.output}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}