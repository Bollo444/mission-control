"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { hexA } from "@/lib/format";

/* A pop-out folder browser. Walks the home tree via /api/workspace?dir= and
 * hands back the chosen directory to launch an agent in. Folders only —
 * picking a place to work, not a file. */

interface Entry {
  name: string;
  path: string;
  isDir: boolean;
}
interface DirResp {
  dir: string;
  parent: string | null;
  entries: Entry[];
  error?: string;
}

export default function DirPicker({
  accent,
  onPick,
  onClose,
}: {
  accent: string;
  onPick: (dir: string) => void;
  onClose: () => void;
}) {
  const [dir, setDir] = useState<string | null>(null); // null → home default
  const [data, setData] = useState<DirResp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const q = dir ? `?dir=${encodeURIComponent(dir)}` : "";
    fetch(`/api/workspace${q}`)
      .then((r) => r.json())
      .then((d: DirResp) => {
        if (live) setData(d);
      })
      .catch(() => live && setData({ dir: dir ?? "", parent: null, entries: [], error: "could not read folder" }))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [dir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const folders = (data?.entries ?? []).filter((e) => e.isDir);
  const here = data?.dir ?? "";

  if (typeof document === "undefined") return null;

  // Portal to <body> so a transformed/backdrop-filtered ancestor can't trap or
  // clip this fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" style={{ background: "rgba(4,6,10,0.6)" }} onClick={onClose}>
      <div
        className="mc-pop-in flex h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border bg-[var(--color-surface)]"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: `0 0 0 1px ${hexA(accent, 0.5)}, 0 0 70px -14px ${hexA(accent, 0.5)}, 0 30px 80px -20px rgba(0,0,0,0.8)` }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--color-ink)]">Choose where to launch</div>
            <div className="truncate font-mono text-[11px] text-[var(--color-ink-4)]" title={here}>{here || "…"}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg text-[var(--color-ink-3)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]">
            ✕
          </button>
        </header>

        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <button
            disabled={!data?.parent}
            onClick={() => data?.parent && setDir(data.parent)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] disabled:opacity-30"
          >
            ↰ Up
          </button>
          <button onClick={() => setDir(null)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)]">
            ⌂ Home
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-[var(--color-ink-4)]">reading folder…</div>
          ) : data?.error ? (
            <div className="grid h-full place-items-center text-sm text-[var(--color-rose)]">{data.error}</div>
          ) : folders.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-[var(--color-ink-4)]">no sub-folders here — launch right here ↓</div>
          ) : (
            folders.map((f) => (
              <button
                key={f.path}
                onClick={() => setDir(f.path)}
                className="mc-glow-edge flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)]"
                style={{ ["--glow" as string]: hexA(accent, 0.5) }}
              >
                <span style={{ color: accent }}>▸</span>
                <span style={{ color: accent }}>🗀</span>
                <span className="truncate">{f.name}</span>
              </button>
            ))
          )}
        </div>

        <footer className="shrink-0 border-t p-3">
          <button
            disabled={!here}
            onClick={() => onPick(here)}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-transform hover:-translate-y-px disabled:opacity-40"
            style={{ background: accent, color: "#0b0c0f" }}
          >
            ⟢ Launch in this folder
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
