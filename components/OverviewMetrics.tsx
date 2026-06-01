"use client";

import { useMemo } from "react";
import { useFetch } from "@/lib/useFetch";
import type { MemoryResp, SystemReport } from "@/lib/types";
import { COLORS, fmtBytes, fmtDuration, pctColor } from "@/lib/format";

/* Live, animated overview telemetry. Bars animate via CSS width transitions
   (no per-frame JS); the sparkline is memoized and only recomputed when the
   activity feed changes. */

export default function OverviewMetrics() {
  const { data: sys } = useFetch<SystemReport>("/api/system", 5000);
  const { data: mem } = useFetch<MemoryResp>("/api/memory", 15000);

  const spark = useMemo(() => buildSparkline(mem?.activity ?? []), [mem?.activity]);

  return (
    <section className="mc-panel p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="mc-live-dot h-2 w-2 rounded-full" style={{ background: COLORS.signal }} />
          Live system
        </h2>
        <span className="truncate text-[11px] text-[var(--color-ink-4)]">
          {sys ? `${sys.host.type} ${sys.host.arch} · node ${sys.node} · up ${fmtDuration(sys.uptimeSec)}` : "polling…"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Gauge label="CPU" pct={sys?.cpu.usagePct} sub={sys ? `${sys.cpu.cores} cores @ ${sys.cpu.speedMHz}MHz` : ""} />
        <Gauge
          label="Memory"
          pct={sys?.memory.usedPct}
          sub={sys ? `${fmtBytes(sys.memory.usedBytes)} / ${fmtBytes(sys.memory.totalBytes)}` : ""}
        />
        <Gauge label="Disk" pct={sys?.disk?.usedPct} sub={sys?.disk ? `${fmtBytes(sys.disk.freeBytes)} free · ${sys.disk.drive}` : ""} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_1.3fr]">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">Fleet readiness</div>
          <FleetBar sys={sys ?? null} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">
            <span>Activity · last 24h</span>
            <span>{(mem?.activity ?? []).length} events</span>
          </div>
          <Sparkline points={spark} />
        </div>
      </div>
    </section>
  );
}

function Gauge({ label, pct, sub }: { label: string; pct?: number; sub: string }) {
  const known = typeof pct === "number";
  const v = known ? (pct as number) : 0;
  const col = known ? pctColor(v) : "var(--color-ink-4)";
  return (
    <div className="overflow-hidden rounded-xl border bg-[var(--color-surface-2)] p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">{label}</span>
        <span className="mc-stat-value text-lg leading-none" style={{ color: col }}>
          {known ? `${v}%` : "…"}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${v}%`, background: col }}
        />
      </div>
      <div className="mt-1.5 truncate text-[11px] text-[var(--color-ink-4)]">{sub || " "}</div>
    </div>
  );
}

function FleetBar({ sys }: { sys: SystemReport | null }) {
  const f = sys?.fleet;
  const total = f?.total ?? 9;
  const ready = f?.ready ?? 0;
  const config = f?.config ?? 0;
  const offline = f?.offline ?? 0;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/10">
        <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${pct(ready)}%`, background: COLORS.ready }} />
        <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${pct(config)}%`, background: COLORS.config }} />
        <div className="h-full transition-[width] duration-700 ease-out" style={{ width: `${pct(offline)}%`, background: COLORS.offline }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <Legend c={COLORS.ready} label="ready" n={ready} />
        <Legend c={COLORS.config} label="config" n={config} />
        <Legend c={COLORS.offline} label="offline" n={offline} />
        <span className="ml-auto text-[var(--color-ink-4)]">{f?.sessions ?? 0} sessions</span>
      </div>
    </div>
  );
}

function Legend({ c, label, n }: { c: string; label: string; n: number }) {
  return (
    <span className="flex items-center gap-1.5 text-[var(--color-ink-3)]">
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />
      {n} {label}
    </span>
  );
}

function buildSparkline(activity: { ts: string }[]): number[] {
  const buckets = 28;
  const now = Date.now();
  const span = 24 * 3600 * 1000;
  const counts = new Array<number>(buckets).fill(0);
  for (const a of activity) {
    const age = now - new Date(a.ts).getTime();
    if (Number.isNaN(age) || age < 0 || age > span) continue;
    const idx = Math.min(buckets - 1, buckets - 1 - Math.floor((age / span) * buckets));
    if (idx >= 0) counts[idx]++;
  }
  return counts;
}

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(1, ...points);
  const w = 100;
  const h = 34;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const line = points.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 3)).toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full" aria-hidden>
      <polygon points={area} fill="rgba(70,224,208,0.12)" />
      <polyline points={line} fill="none" stroke={COLORS.signal} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
