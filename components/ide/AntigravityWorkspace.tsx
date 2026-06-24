"use client";

import { useCallback, useEffect, useState } from "react";

/* ------------------------------------------------------------------ *
 * Workspace browser for the Antigravity IDE — navigate real project    *
 * folders (confined to home), open files in a modal editor, save back. *
 * Self-contained: own state + editor, no coupling to the vault editor. *
 * ------------------------------------------------------------------ */

const AC = "#6ea8fe";

interface Entry { name: string; path: string; isDir: boolean; size: number; }
interface Listing { dir: string; parent: string | null; entries: Entry[]; }

function fmtSize(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length <= 3 ? p.replace(/\\/g, "/") : "…/" + parts.slice(-3).join("/");
}

function FileEditor({ file, onClose }: { file: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [orig, setOrig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<"" | "saving" | "saved">("");

  useEffect(() => {
    fetch(`/api/workspace?file=${encodeURIComponent(file)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : (setContent(j.content), setOrig(j.content))))
      .catch((e: Error) => setErr(e.message));
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dirty = content !== null && content !== orig;
  const save = async () => {
    if (content === null) return;
    setState("saving");
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ file, content }),
      });
      const j = await r.json();
      if (j.ok) { setOrig(content); setState("saved"); setTimeout(() => setState(""), 1500); }
      else { setErr(j.error || "save failed"); setState(""); }
    } catch (e) { setErr((e as Error).message); setState(""); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl" style={{ background: "#0d1119", border: "1px solid rgba(255,255,255,0.12)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <span className="truncate font-mono text-xs text-[var(--color-ink-2)]" title={file}>{shortPath(file)}{dirty ? " ●" : ""}</span>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={save} disabled={!dirty || state === "saving"} className="rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-40" style={{ background: AC, color: "#0a0d16" }}>
              {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : "Save"}
            </button>
            <button onClick={onClose} className="rounded-lg border border-white/10 px-3 py-1 text-xs font-semibold text-[var(--color-ink-3)]">Close</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          {err && <p className="p-3 text-center text-xs text-[var(--color-rose)]">⚠ {err}</p>}
          {!err && content === null && <p className="p-3 text-center text-xs text-[var(--color-ink-4)]">Loading…</p>}
          {content !== null && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="h-[60vh] w-full resize-none rounded-lg border border-white/10 bg-[#0a0d16] p-3 font-mono text-[12px] leading-relaxed text-[var(--color-ink)] outline-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function AntigravityWorkspace() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback((dir?: string) => {
    const q = dir ? `?dir=${encodeURIComponent(dir)}` : "";
    fetch(`/api/workspace${q}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(j.error) : (setListing(j), setErr(null))))
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <button
          onClick={() => listing?.parent && load(listing.parent)}
          disabled={!listing?.parent}
          title="Up a folder"
          className="rounded px-1.5 text-sm text-[var(--color-ink-3)] disabled:opacity-30"
        >↰</button>
        <span className="truncate font-mono text-[11px] text-[var(--color-ink-4)]" title={listing?.dir}>
          {listing ? shortPath(listing.dir) : "…"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {err && <p className="px-3 py-3 text-xs text-[var(--color-rose)]">⚠ {err}</p>}
        {listing?.entries.map((e) => (
          <button
            key={e.path}
            onClick={() => (e.isDir ? load(e.path) : setOpen(e.path))}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-white/[0.04]"
          >
            <span style={{ color: e.isDir ? AC : "var(--color-ink-4)" }}>{e.isDir ? "▸" : "·"}</span>
            <span className="truncate text-[var(--color-ink-2)]">{e.name}</span>
            {!e.isDir && <span className="ml-auto shrink-0 text-[10px] text-[var(--color-ink-4)]">{fmtSize(e.size)}</span>}
          </button>
        ))}
        {listing && listing.entries.length === 0 && (
          <p className="px-3 py-3 text-xs text-[var(--color-ink-4)]">Empty folder.</p>
        )}
      </div>

      {open && <FileEditor file={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
