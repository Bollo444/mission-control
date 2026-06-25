"use client";

import { useEffect, useState, type ReactNode } from "react";

export const CX = {
  base: "#0a0f0d",
  surface: "#0d1512",
  surface2: "#122019",
  line: "#1d2a26",
  accent: "#10a37f",
  bright: "#34e6b3",
  ink: "#cfe3dc",
  dim: "#6f8d85",
};

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: CX.dim }}>
      {children}
    </div>
  );
}

/** Renders raw `codex …` CLI output in a terminal pane, with loading/empty/error states. */
export function CliPanel({ title, url, hint }: { title: string; url: string; hint?: string }) {
  const [data, setData] = useState<{ ok: boolean; out: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    fetch(url)
      .then((r) => r.json())
      .then(setData)
      .catch((e: Error) => setData({ ok: false, out: e.message }))
      .finally(() => setBusy(false));
  };
  useEffect(load, [url]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        <button onClick={load} disabled={busy} className="rounded font-mono text-[11px] disabled:opacity-50" style={{ color: CX.accent }}>
          {busy ? "running…" : "↻ refresh"}
        </button>
      </div>
      {hint && <p className="mb-2 text-[12px]" style={{ color: CX.dim }}>{hint}</p>}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg p-3" style={{ border: `1px solid ${CX.line}`, background: CX.surface }}>
        {!data ? (
          <p className="font-mono text-xs" style={{ color: CX.dim }}>running `{title.toLowerCase()}`…</p>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed" style={{ color: data.ok ? CX.ink : "#ff8f8f", margin: 0 }}>
            {data.out?.trim() || "(no output)"}
          </pre>
        )}
      </div>
    </div>
  );
}
