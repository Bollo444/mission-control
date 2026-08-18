"use client";

import { useFetch } from "@/lib/useFetch";
import type { SystemReport } from "@/lib/types";
import { fmtBytes, hexA } from "@/lib/format";

/* Right-side system meter — live CPU / memory / disk as three independent
 * floating glass chips, each in its own color so the processes read apart.
 * No enclosing box: each chip floats on its own translucent glass with a
 * soft glow, easing the bar widths so the numbers feel alive. Polls
 * /api/system every 2s (the same live snapshot the overview page uses). */

const GOLD = "#f5b75a";
const ROSE = "#f06a7a";
const VIOLET = "#9d8cff";

function chip(color: string): React.CSSProperties {
  return {
    background: "rgba(10,10,14,0.5)",
    backdropFilter: "blur(14px)",
    boxShadow: `inset 0 0 0 1px ${hexA(color, 0.16)}, 0 10px 30px -12px rgba(0,0,0,0.7)`,
  };
}

export default function SystemMeter({ space, immersive }: { space: number; immersive: boolean }) {
  const { data } = useFetch<SystemReport>("/api/system", 2000);

  // Yield to the orb: hidden during immersive mode (the orb owns the stage)
  // and on stages too narrow for the three chips to clear the orb.
  if (immersive || (space > 0 && space < 980)) return null;

  return (
    <div className="pointer-events-auto absolute bottom-10 right-5 z-30 flex flex-col items-end gap-2.5">
      <FloatingChip
        label="CPU"
        pct={data?.cpu.usagePct}
        color={GOLD}
        sub={data ? `${data.cpu.cores} cores @ ${data.cpu.speedMHz}MHz` : ""}
      />
      <FloatingChip
        label="Memory"
        pct={data?.memory.usedPct}
        color={ROSE}
        sub={data ? `${fmtBytes(data.memory.usedBytes)} / ${fmtBytes(data.memory.totalBytes)}` : ""}
      />
      <FloatingChip
        label="Disk"
        pct={data?.disk?.usedPct}
        color={VIOLET}
        sub={data?.disk ? `${fmtBytes(data.disk.freeBytes)} free · ${data.disk.drive}` : ""}
      />
    </div>
  );
}

function FloatingChip({
  label,
  pct,
  color,
  sub,
}: {
  label: string;
  pct?: number;
  color: string;
  sub: string;
}) {
  const known = typeof pct === "number";
  const v = known ? (pct as number) : 0;
  return (
    <div className="w-44 rounded-2xl px-3.5 py-2.5" style={chip(color)}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ink-3)" }}>
          <span className="mc-live-dot h-1.5 w-1.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
        <span className="mc-stat-value text-sm leading-none tabular-nums" style={{ color: known ? color : "var(--color-ink-4)" }}>
          {known ? `${v}%` : "…"}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${v}%`, background: color, boxShadow: `0 0 8px ${hexA(color, 0.55)}` }}
        />
      </div>
      {sub && <div className="mt-1 truncate text-[9px] text-[var(--color-ink-4)]">{sub}</div>}
    </div>
  );
}
