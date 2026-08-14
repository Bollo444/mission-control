"use client";

import { useMemo, useState } from "react";
import type { ActivityEntry } from "@/lib/types";
import { hexA, relTime } from "@/lib/format";

export type SwarmMode = "neural" | "orbit" | "stream";

/* A living visualization of the shared-memory feed. Each event is a bubble;
   three expressions read the same data differently:
   - neural  → a connected network (relationships)
   - orbit   → per-agent rings around a core (who's active)
   - stream  → newest-at-top chronological flow (recency)
   Clicking a bubble pops it open to the full memory event. */

function rnd(seed: number) {
  const x = Math.sin(seed * 99.73) * 43758.5453;
  return x - Math.floor(x);
}

interface Node {
  entry: ActivityEntry;
  x: number;
  y: number;
  size: number;
  accent: string;
  dur: number;
  delay: number;
  /** Orbit-mode depth (-1 behind … +1 front) — drives size/opacity for a 3D feel. */
  depth?: number;
}

const CAP = 44;

export default function MemorySwarm({
  entries,
  accentFor,
  mode,
}: {
  entries: ActivityEntry[];
  accentFor: (id: string) => string;
  mode: SwarmMode;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const items = useMemo(() => entries.slice(0, CAP), [entries]);
  const n = items.length;

  const nodes = useMemo<Node[]>(() => {
    const agents = Array.from(new Set(items.map((e) => e.agentId)));
    return items.map((entry, i) => {
      let size = i < 6 ? 16 : i < 18 ? 11 : 8;
      const accent = accentFor(entry.agentId);
      const dur = 6 + rnd(i) * 7;
      const delay = rnd(i * 3) * -9;
      let x: number;
      let y: number;
      if (mode === "stream") {
        y = 7 + (i / Math.max(1, n - 1)) * 86;
        x = 50 + (rnd(i * 5) * 2 - 1) * 36;
      } else if (mode === "orbit") {
        const gi = agents.indexOf(entry.agentId);
        const ring = items.filter((e) => e.agentId === entry.agentId);
        const j = ring.indexOf(entry);
        const R = 13 + gi * 8.5;
        const ang = (j / Math.max(1, ring.length)) * Math.PI * 2 + gi * 0.7;
        x = 50 + Math.cos(ang) * R;
        y = 50 + Math.sin(ang) * R * 0.9;
        // Fake 3D: bubbles nearer the viewer (lower on the ellipse) are bigger
        // and brighter; the far side recedes — the ring reads as a tilted disc.
        const depth = Math.max(-1, Math.min(1, (y - 50) / 36));
        size = size * (1 + depth * 0.5);
        return { entry, x, y, size, accent, dur, delay, depth };
      } else {
        x = 7 + rnd(i * 2) * 86;
        y = 9 + rnd(i * 2 + 1) * 82;
      }
      return { entry, x, y, size, accent, dur, delay };
    });
  }, [items, n, mode, accentFor]);

  const links = useMemo(() => {
    if (mode !== "neural") return [] as { x1: number; y1: number; x2: number; y2: number; c: string }[];
    const out: { x1: number; y1: number; x2: number; y2: number; c: string }[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (const k of [i + 1, i + 4]) {
        const b = nodes[k];
        if (b) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, c: a.accent });
      }
    }
    return out;
  }, [nodes, mode]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border bg-[var(--color-base)]">
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(80% 70% at 50% 38%, rgba(70,224,208,0.06), transparent 70%)" }}
      />

      {mode === "neural" && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {links.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.c} strokeOpacity={0.13} strokeWidth={0.15} />
          ))}
        </svg>
      )}

      {mode === "orbit" && (
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {[13, 21.5, 30, 38.5].map((r, i) => (
            <ellipse key={i} cx="50" cy="50" rx={r} ry={r * 0.9} fill="none" stroke="#46e0d0" strokeOpacity={0.09} strokeWidth={0.15} />
          ))}
          <circle cx="50" cy="50" r="1.4" fill="#46e0d0" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
        </svg>
      )}

      {nodes.map((node, i) => (
        <button
          key={i}
          onClick={() => setSel(i)}
          className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:!scale-150"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size,
            height: node.size,
            opacity: node.depth !== undefined ? 0.62 + (node.depth + 1) * 0.19 : 1,
            background: hexA(node.accent, 0.22),
            boxShadow: `0 0 ${node.size}px ${hexA(node.accent, 0.5)}, inset 0 0 0 1px ${hexA(node.accent, 0.75)}`,
            animation: `mc-float ${node.dur}s ease-in-out ${node.delay}s infinite`,
          }}
          aria-label={`${node.entry.agentName}: ${node.entry.action}`}
        >
          <span
            className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[9px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: node.accent }}
          >
            {node.entry.agentName}
          </span>
        </button>
      ))}

      {sel != null && nodes[sel] && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/45 p-4" onClick={() => setSel(null)}>
          <div
            className="mc-pop-in w-[320px] max-w-full rounded-xl border bg-[var(--color-surface)] p-4"
            style={{ boxShadow: `0 0 0 1px ${hexA(nodes[sel].accent, 0.45)}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: nodes[sel].accent }}>
                <span className="h-2 w-2 rounded-full" style={{ background: nodes[sel].accent }} />
                {nodes[sel].entry.agentName}
              </span>
              <button onClick={() => setSel(null)} className="text-[var(--color-ink-4)] hover:text-[var(--color-ink)]">
                ✕
              </button>
            </div>
            <div className="text-sm text-[var(--color-ink)]">{nodes[sel].entry.action}</div>
            {nodes[sel].entry.detail && (
              <div className="mt-1 break-words text-xs text-[var(--color-ink-3)]">{nodes[sel].entry.detail}</div>
            )}
            <div className="mt-2 font-mono text-[11px] text-[var(--color-ink-4)]">{relTime(nodes[sel].entry.ts)}</div>
          </div>
        </div>
      )}

      {n === 0 && (
        <div className="grid h-full place-items-center text-xs text-[var(--color-ink-4)]">No memory events yet.</div>
      )}
    </div>
  );
}
