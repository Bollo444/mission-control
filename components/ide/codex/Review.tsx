"use client";

import { useState } from "react";
import { CX, Eyebrow } from "./_ui";

export default function CodexReview() {
  const [target, setTarget] = useState(".");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setOut(null);
    try {
      const r = await fetch("/api/codex/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }) });
      const j = await r.json();
      setOut(j.out || "(no output)");
    } catch (e) {
      setOut((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Eyebrow>Code review</Eyebrow>
      <p className="mb-3 text-[12px]" style={{ color: CX.dim }}>Runs <span className="font-mono">codex review</span> non-interactively on a path or diff target.</p>
      <div className="mb-3 flex items-center gap-2">
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="path or target (e.g. . or HEAD~1)" className="flex-1 rounded-lg px-3 py-2 font-mono text-sm outline-none" style={{ background: CX.surface, border: `1px solid ${CX.line}`, color: CX.ink }} />
        <button onClick={run} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: CX.accent, color: CX.base }}>{busy ? "reviewing…" : "▶ Review"}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg p-3" style={{ border: `1px solid ${CX.line}`, background: CX.surface }}>
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed" style={{ color: CX.ink, margin: 0 }}>
          {out ?? "Run a review to see Codex's findings."}
        </pre>
      </div>
    </div>
  );
}
