"use client";

import { useFetch } from "@/lib/useFetch";
import type { AgentDetail, SystemReport } from "@/lib/types";
import { fmtBytes, fmtDuration, pctColor } from "@/lib/format";
import { OpenClawMascot } from "@/components/skins/mascots";
import { OpenClawBg } from "@/components/skins/backgrounds";
import FleetTerminal from "./FleetTerminal";
import WindowControls from "./WindowControls";
import LaunchControls from "@/components/LaunchControls";

const ACCENT = "#ff4438";

const DELEGATED = [
  "Temp & cache cleanup — reclaim disk from %TEMP%, caches, and stale artifacts",
  "File organization — sort, dedupe, and archive directories",
  "App lifecycle — install / uninstall via winget, audit installed programs",
  "Resource tuning — startup apps, power plans, service & memory headroom",
];

const SAFETY = [
  "Create a System Restore point before any change",
  "Dry-run & list before deleting — prefer Recycle Bin over permanent delete",
  "Propose, don't auto-run: destructive commands are printed for you to execute",
  "Never bulk-uninstall without explicit confirmation",
  "Log every action to the shared vault",
];

export default function OpenClawConsole({ agent }: { agent: AgentDetail }) {
  const { data: sys } = useFetch<SystemReport>("/api/system", 5000);
  const installed = agent.status.installed;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#120708] text-[var(--color-ink)]">
      {/* Windows title bar */}
      <div className="flex h-9 shrink-0 items-center border-b border-white/10">
        <div className="flex items-center gap-2 px-3 text-xs text-[var(--color-ink-3)]">
          <OpenClawMascot size={18} />
          <span className="font-semibold text-[var(--color-ink)]">OpenClaw</span>
          <span className="text-[var(--color-ink-4)]">— System Operations Console</span>
        </div>
        <span className="ml-auto px-3 text-[11px] text-[var(--color-ink-4)]">
          designated · direct PC alteration
        </span>
        <WindowControls />
      </div>

      {/* hero + live machine-health metrics */}
      <div className="relative shrink-0 overflow-hidden border-b border-white/10">
        <OpenClawBg className="opacity-60" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(18,7,8,0.92) 0%, rgba(18,7,8,0.6) 55%, rgba(18,7,8,0.2) 100%)",
          }}
        />
        <div className="relative px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                className="mc-anim-float grid h-16 w-16 shrink-0 place-items-center rounded-2xl"
                style={{ background: "rgba(255,68,56,0.1)", boxShadow: "inset 0 0 0 1px rgba(255,68,56,0.35)" }}
              >
                <OpenClawMascot size={52} />
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>
                  Apex · machine health
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">OpenClaw</h1>
                <p className="mt-0.5 max-w-xl text-sm text-[var(--color-ink-3)]">
                  The fleet&apos;s designated owner for direct PC alteration — delegated by jcode, reviewed by Claude.
                </p>
              </div>
            </div>
            <div className="min-w-[260px]">
              <LaunchControls
                id="openclaw"
                accent={ACCENT}
                kind="cli"
                installed={installed}
                installCommand={agent.install?.command}
                installUnverified={agent.install?.unverified}
              />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="disk"
              pct={sys?.disk?.usedPct ?? 0}
              detail={sys?.disk ? `${fmtBytes(sys.disk.freeBytes)} free · ${sys.disk.drive}` : "…"}
            />
            <Metric
              label="memory"
              pct={sys?.memory.usedPct ?? 0}
              detail={sys ? `${fmtBytes(sys.memory.usedBytes)} / ${fmtBytes(sys.memory.totalBytes)}` : "…"}
            />
            <Metric label="cpu" pct={sys?.cpu.usagePct ?? 0} detail={sys ? `${sys.cpu.cores} cores` : "…"} />
            <Metric
              label="uptime"
              pct={null}
              detail={sys ? fmtDuration(sys.uptimeSec) : "…"}
              value={sys ? fmtDuration(sys.uptimeSec) : "…"}
            />
          </div>
        </div>
      </div>

      {/* charter + terminal */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[320px] shrink-0 flex-col gap-4 overflow-auto border-r border-white/10 p-4 lg:flex">
          <Section title="Delegated charter" accent={ACCENT}>
            {DELEGATED.map((d) => (
              <li key={d} className="flex gap-2 text-[13px] text-[var(--color-ink-2)]">
                <span style={{ color: ACCENT }}>›</span>
                <span>{d}</span>
              </li>
            ))}
          </Section>
          <Section title="Safety protocol" accent={ACCENT}>
            {SAFETY.map((d) => (
              <li key={d} className="flex gap-2 text-[13px] text-[var(--color-ink-3)]">
                <span style={{ color: "#5cd6a0" }}>✓</span>
                <span>{d}</span>
              </li>
            ))}
          </Section>
          {!installed && (
            <div className="rounded-lg border border-dashed border-white/15 p-3 text-[11px] leading-relaxed text-[var(--color-ink-4)]">
              OpenClaw is provisioned as a persona until its binary resolves. The console assesses the live system
              now; destructive actions are proposed for you to run until OpenClaw is installed.
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-8 shrink-0 items-center gap-4 border-b border-white/10 px-4 text-[11px] uppercase tracking-wider">
            <span style={{ color: ACCENT }}>● Terminal</span>
            <span className="text-[var(--color-ink-4)]">live check + system ops · type `help`</span>
          </div>
          <div className="min-h-0 flex-1">
            <FleetTerminal prompt="openclaw" accent={ACCENT} sysops />
          </div>
        </div>
      </div>

      {/* status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 px-3 text-[11px] text-[#ffe7e3]" style={{ background: ACCENT }}>
        <span>⌖ system operations</span>
        {sys?.disk && <span>disk {sys.disk.usedPct}%</span>}
        {sys && <span>mem {sys.memory.usedPct}%</span>}
        {sys && <span>cpu {sys.cpu.usagePct}%</span>}
        <span className="ml-auto">{installed ? "ready" : "persona · not installed"}</span>
      </div>
    </div>
  );
}

function Metric({
  label,
  pct,
  detail,
  value,
}: {
  label: string;
  pct: number | null;
  detail: string;
  value?: string;
}) {
  const col = pct != null ? pctColor(pct) : ACCENT;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">{label}</span>
        <span className="mc-stat-value text-lg leading-none" style={{ color: col }}>
          {value ?? `${pct}%`}
        </span>
      </div>
      {pct != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: col }} />
        </div>
      )}
      <div className="mt-1.5 truncate text-[11px] text-[var(--color-ink-4)]">{detail}</div>
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className="h-3 w-1 rounded-full" style={{ background: accent }} />
        {title}
      </h2>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </div>
  );
}
