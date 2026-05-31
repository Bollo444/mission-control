"use client";

import { useState } from "react";
import type { ConfigView } from "@/lib/types";
import { hexA } from "@/lib/format";

function basename(p: string) {
  return p.split(/[\\/]/).pop() || p;
}

export default function ConfigViewer({
  configs,
  accent,
}: {
  configs: ConfigView[];
  accent: string;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (configs.length === 0) {
    return (
      <p className="text-sm text-[var(--color-ink-4)]">No config paths registered.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {configs.map((c) => {
        const isOpen = open === c.path;
        return (
          <div
            key={c.path}
            className="overflow-hidden rounded-lg border bg-[var(--color-surface-2)]"
          >
            <button
              onClick={() => setOpen(isOpen ? null : c.path)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: c.exists ? accent : "var(--color-ink-4)" }}
                />
                <span className="truncate font-mono text-xs text-[var(--color-ink-2)]">
                  {basename(c.path)}
                </span>
                <span className="rounded border px-1.5 py-0.5 text-[10px] uppercase text-[var(--color-ink-4)]">
                  {c.kind}
                </span>
              </span>
              <span className="text-xs text-[var(--color-ink-4)]">
                {c.exists ? (isOpen ? "hide" : "view") : "missing"}
              </span>
            </button>
            {isOpen && c.exists && (
              <div className="border-t px-3 py-3">
                <div className="mb-2 break-all font-mono text-[10px] text-[var(--color-ink-4)]">
                  {c.path}
                </div>
                {c.keys && c.keys.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {c.keys.map((k) => (
                      <span
                        key={k}
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ background: hexA(accent, 0.1), color: accent }}
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                )}
                {c.entries && (
                  <div className="flex flex-wrap gap-1">
                    {c.entries.map((e) => (
                      <span
                        key={e}
                        className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink-3)]"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                )}
                {c.preview && (
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-[var(--color-base)] p-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-3)]">
                    {c.preview}
                  </pre>
                )}
                {c.error && (
                  <div className="mt-1 text-[11px] text-[var(--color-rose)]">{c.error}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
