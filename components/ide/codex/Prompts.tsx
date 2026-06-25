"use client";

import { useEffect, useState } from "react";
import { CX, Eyebrow } from "./_ui";

interface Prompt { name: string; body: string }

export default function CodexPrompts() {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [open, setOpen] = useState<Prompt | null>(null);

  useEffect(() => {
    fetch("/api/codex/prompts").then((r) => r.json()).then((j) => setPrompts(j.prompts ?? [])).catch(() => setPrompts([]));
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Eyebrow>Prompts · custom chatbots</Eyebrow>
      <p className="mb-3 text-[12px]" style={{ color: CX.dim }}>Saved Codex prompts from <span className="font-mono">~/.codex/prompts</span> — your reusable personas.</p>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="w-1/3 min-w-0 overflow-y-auto">
          {prompts === null && <p className="font-mono text-xs" style={{ color: CX.dim }}>loading…</p>}
          {prompts?.length === 0 && <p className="text-xs" style={{ color: CX.dim }}>No saved prompts yet.</p>}
          {prompts?.map((p) => (
            <button key={p.name} onClick={() => setOpen(p)} className="mb-1 block w-full truncate rounded px-2 py-1.5 text-left font-mono text-[12px]" style={{ color: open?.name === p.name ? CX.accent : CX.ink, background: open?.name === p.name ? "rgba(16,163,127,0.08)" : "transparent" }}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg p-3" style={{ border: `1px solid ${CX.line}`, background: CX.surface }}>
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed" style={{ color: CX.ink, margin: 0 }}>
            {open ? open.body : "Select a prompt to view it."}
          </pre>
        </div>
      </div>
    </div>
  );
}
