"use client";

import { useEffect, useState } from "react";
import { CX, Eyebrow } from "./_ui";

interface Sess { id: string; path: string; title: string; mtime: string; sizeKB: number }

function rel(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CodexSessions() {
  const [sessions, setSessions] = useState<Sess[] | null>(null);
  const [open, setOpen] = useState<Sess | null>(null);
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/codex/sessions").then((r) => r.json()).then((j) => setSessions(j.sessions ?? [])).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    setBody(null);
    fetch(`/api/sessions/content?path=${encodeURIComponent(open.path)}`)
      .then((r) => r.json())
      .then((j) => setBody(j.error ? `⚠ ${j.error}` : (j.messages ?? []).map((m: { role: string; text: string }) => `[${m.role}]\n${m.text}`).join("\n\n") || "(empty)"))
      .catch((e: Error) => setBody(e.message));
  }, [open]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Eyebrow>Sessions · resume / fork / archive</Eyebrow>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="w-1/3 min-w-0 overflow-y-auto">
          {sessions === null && <p className="font-mono text-xs" style={{ color: CX.dim }}>loading…</p>}
          {sessions?.length === 0 && <p className="text-xs" style={{ color: CX.dim }}>No Codex sessions yet. Start one in the Session tab.</p>}
          {sessions?.map((s) => (
            <button key={s.path} onClick={() => setOpen(s)} className="mb-1 block w-full rounded px-2 py-1.5 text-left" style={{ background: open?.path === s.path ? "rgba(16,163,127,0.08)" : "transparent" }}>
              <div className="truncate font-mono text-[12px]" style={{ color: open?.path === s.path ? CX.accent : CX.ink }}>{s.title}</div>
              <div className="font-mono text-[10px]" style={{ color: CX.dim }}>{rel(s.mtime)} · {s.sizeKB} KB</div>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg p-3" style={{ border: `1px solid ${CX.line}`, background: CX.surface }}>
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed" style={{ color: CX.ink, margin: 0 }}>
            {!open ? "Select a session to view it." : body ?? "loading…"}
          </pre>
        </div>
      </div>
    </div>
  );
}
