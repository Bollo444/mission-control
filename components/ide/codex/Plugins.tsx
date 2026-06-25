"use client";

import { useEffect, useState } from "react";
import { CX, Eyebrow } from "./_ui";

export default function CodexPlugins() {
  const [data, setData] = useState<{ plugins: { ok: boolean; out: string }; marketplaces: { ok: boolean; out: string } } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    fetch("/api/codex/plugins").then((r) => r.json()).then(setData).catch(() => {}).finally(() => setBusy(false));
  };
  useEffect(load, []);

  const Pane = ({ title, body }: { title: string; body?: string }) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <Eyebrow>{title}</Eyebrow>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg p-3" style={{ border: `1px solid ${CX.line}`, background: CX.surface }}>
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed" style={{ color: CX.ink, margin: 0 }}>
          {body?.trim() || "(none)"}
        </pre>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>Plugins · apps library</Eyebrow>
        <button onClick={load} disabled={busy} className="font-mono text-[11px] disabled:opacity-50" style={{ color: CX.accent }}>{busy ? "loading…" : "↻ refresh"}</button>
      </div>
      <p className="mb-3 text-[12px]" style={{ color: CX.dim }}>Install via marketplace: <span className="font-mono">codex plugin add &lt;name&gt;</span></p>
      <div className="flex min-h-0 flex-1 gap-4">
        <Pane title="Installed" body={data?.plugins.out} />
        <Pane title="Marketplaces" body={data?.marketplaces.out} />
      </div>
    </div>
  );
}
