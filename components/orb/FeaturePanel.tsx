"use client";

import { useEffect, type ReactNode } from "react";
import { hexA } from "@/lib/format";

/* A feature revealed in place: a framed holographic panel that scales up over
 * the dimmed, still-breathing orb. Esc or backdrop click returns to the orb. */
export default function FeaturePanel({
  glyph,
  label,
  accent,
  onClose,
  children,
}: {
  glyph: string;
  label: string;
  accent: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center p-4 sm:p-8"
      style={{ background: "rgba(6,6,10,0.55)" }}
      onClick={onClose}
    >
      <div
        className="mc-rise flex h-[88vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface)",
          boxShadow: `0 0 0 1px ${hexA(accent, 0.5)}, 0 0 80px -10px ${hexA(accent, 0.35)}, 0 30px 90px -20px rgba(0,0,0,0.8)`,
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${hexA(accent, 0.3)}` }}
        >
          <div className="flex items-center gap-3">
            <span
              className="grid h-8 w-8 place-items-center rounded-lg text-base"
              style={{ background: hexA(accent, 0.14), color: accent, boxShadow: `inset 0 0 0 1px ${hexA(accent, 0.4)}` }}
            >
              {glyph}
            </span>
            <h2 className="font-serif text-lg font-semibold tracking-tight" style={{ color: "var(--color-ink)" }}>
              {label}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-lg text-lg text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
