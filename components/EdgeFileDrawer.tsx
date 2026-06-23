"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hexA } from "@/lib/format";

/* ------------------------------------------------------------------ *
 * Right-edge system-file drawer. A thin hot-zone hugs the right edge   *
 * of the window; hovering it slides out an inventory of the fleet's    *
 * on-disk system files (agent configs, vault, app settings). Clicking  *
 * a file peeks its contents. Closes when the pointer leaves.           *
 * ------------------------------------------------------------------ */

interface SysFile {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  mtime: number;
}
interface SysGroup {
  id: string;
  label: string;
  accent?: string;
  files: SysFile[];
}

const SIGNAL = "#f5b75a";

function fmtSize(n: number): string {
  if (n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function EdgeFileDrawer() {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<SysGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<SysFile | null>(null);
  const [content, setContent] = useState<string>("");
  const [viewing, setViewing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (groups || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/system/files", { cache: "no-store" });
      const json = (await res.json()) as { groups: SysGroup[] };
      setGroups(json.groups ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [groups, loading]);

  const show = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    void load();
  }, [load]);

  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 240);
  }, []);

  const peek = useCallback(async (f: SysFile) => {
    if (f.isDir) return;
    setActive(f);
    setViewing(true);
    setContent("loading…");
    try {
      const res = await fetch(`/api/system/files?path=${encodeURIComponent(f.path)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { ok: boolean; content?: string; error?: string };
      setContent(json.ok ? json.content ?? "" : `⚠ ${json.error ?? "could not read file"}`);
    } catch (e) {
      setContent(`⚠ ${(e as Error).message}`);
    }
  }, []);

  // Slam-to-edge: throwing the pointer at the far right edge of the window
  // opens the drawer without needing to hit the thin hot-zone precisely.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (e.clientX >= window.innerWidth - 2) show();
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [show]);

  // Close the peek viewer on Escape.
  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setViewing(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewing]);

  return (
    <>
      {/* Hot-zone hugging the right edge — always present, invisible until hovered. */}
      <div
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        className="fixed right-0 top-0 z-[55] h-screen w-3"
        aria-hidden
      >
        {/* A faint vertical handle hints the drawer exists. */}
        <div
          className="absolute right-0 top-1/2 h-24 w-1 -translate-y-1/2 rounded-l-full transition-opacity"
          style={{ background: hexA("#f5b75a", open ? 0.0 : 0.4) }}
        />
      </div>

      {/* The drawer panel — blurred dark glass with yellow motes drifting inside. */}
      <aside
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        className="fixed right-0 top-0 z-[56] flex h-screen w-[330px] max-w-[88vw] flex-col overflow-hidden border-l shadow-2xl backdrop-blur-2xl"
        style={{
          background: "rgba(8, 9, 12, 0.62)",
          borderColor: hexA("#f5b75a", 0.22),
          transform: open ? "translateX(0) scale(1)" : "translateX(100%) scale(0.985)",
          opacity: open ? 1 : 0,
          transition: "transform 360ms cubic-bezier(0.16,1,0.3,1), opacity 280ms ease",
        }}
      >
        {/* Floating yellow motes — confined to this panel by overflow-hidden. */}
        {[
          { s: 150, l: "-30px", t: "8%", a: 0.18, d: "15s" },
          { s: 110, l: "60%", t: "34%", a: 0.14, d: "19s" },
          { s: 180, l: "-40px", t: "66%", a: 0.12, d: "23s" },
          { s: 90, l: "55%", t: "85%", a: 0.16, d: "13s" },
        ].map((b, i) => (
          <span
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              width: b.s,
              height: b.s,
              left: b.l,
              top: b.t,
              background: hexA("#f5b75a", b.a),
              filter: "blur(38px)",
              animation: `mc-drift ${b.d} ease-in-out infinite`,
            }}
          />
        ))}

        <div className="relative z-10 flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">System files</div>
            <div className="text-[11px] text-[var(--color-ink-4)]">
              agent configs · vault · settings
            </div>
          </div>
          <span className="text-[11px] text-[var(--color-ink-4)]">hover edge ▸</span>
        </div>

        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading && <div className="px-2 text-sm text-[var(--color-ink-4)]">scanning…</div>}
          {groups?.length === 0 && !loading && (
            <div className="px-2 text-sm text-[var(--color-ink-4)]">No system files detected.</div>
          )}
          {groups?.map((g) => (
            <div key={g.id} className="mb-3">
              <div className="mb-1 flex items-center gap-2 px-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: g.accent ?? SIGNAL }}
                />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
                  {g.label}
                </span>
                <span className="text-[10px] text-[var(--color-ink-4)]">{g.files.length}</span>
              </div>
              <div className="flex flex-col">
                {g.files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => void peek(f)}
                    disabled={f.isDir}
                    title={f.path}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-[var(--color-surface-3)] disabled:cursor-default"
                  >
                    <span className="text-[var(--color-ink-4)]">{f.isDir ? "▸" : "·"}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--color-ink-2)]">
                      {f.name}
                    </span>
                    <span className="shrink-0 text-[10px] text-[var(--color-ink-4)]">
                      {f.isDir ? "dir" : fmtSize(f.size)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* File peek viewer. */}
      {viewing && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-6"
          onClick={() => setViewing(false)}
        >
          <div
            className="flex h-[78%] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-[var(--color-surface)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{active?.name}</div>
                <div className="truncate text-[11px] text-[var(--color-ink-4)]">{active?.path}</div>
              </div>
              <button
                onClick={() => setViewing(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-lg text-[var(--color-ink-4)] hover:bg-[var(--color-surface-3)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--color-ink-2)]">
              {content}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
