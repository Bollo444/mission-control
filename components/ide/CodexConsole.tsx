"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentDetail } from "@/lib/types";
import dynamic from "next/dynamic";
import CodexPlugins from "./codex/Plugins";
import CodexMcp from "./codex/Mcp";
import CodexSessions from "./codex/Sessions";
import CodexPrompts from "./codex/Prompts";
import CodexReview from "./codex/Review";
import CodexCloud from "./codex/Cloud";

const NativeTerminal = dynamic(() => import("./NativeTerminal"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm" style={{ color: CX.dim }}>
      booting Codex…
    </div>
  ),
});

/* ------------------------------------------------------------------ *
 * Codex — OpenAI's agentic coding CLI, on the free gateway. A noir     *
 * "cipher" console: the hero sits over a faint hex-rain canvas, the    *
 * tabs are the codex's chapters. One accent (#10a37f), spent surgically.*
 * ------------------------------------------------------------------ */

const CX = {
  base: "#0a0f0d",
  surface: "#0d1512",
  surface2: "#122019",
  line: "#1d2a26",
  accent: "#10a37f",
  bright: "#34e6b3",
  ink: "#cfe3dc",
  dim: "#6f8d85",
};

// Signature: a quiet hex cipher-rain. Canvas + rAF only — never React state.
function CipherRain() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const HEX = "0123456789abcdef";
    let cols: number[] = [];
    let w = 0, h = 0, raf = 0, last = 0;
    const resize = () => {
      const r = cv.getBoundingClientRect();
      w = cv.width = Math.max(1, Math.floor(r.width));
      h = cv.height = Math.max(1, Math.floor(r.height));
      cols = new Array(Math.floor(w / 14)).fill(0).map(() => Math.random() * h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 90) return; // ~11fps — ambient, cheap
      last = t;
      ctx.fillStyle = "rgba(10,15,13,0.28)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = "12px 'Cascadia Code', ui-monospace, monospace";
      for (let i = 0; i < cols.length; i++) {
        const x = i * 14;
        const y = cols[i];
        ctx.fillStyle = Math.random() < 0.04 ? "rgba(52,230,179,0.55)" : "rgba(16,163,127,0.16)";
        ctx.fillText(HEX[(Math.random() * 16) | 0], x, y);
        cols[i] = y > h + Math.random() * 120 ? 0 : y + 14;
      }
    };
    if (!reduced) raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full opacity-60" aria-hidden />;
}

type TabId = "session" | "plugins" | "mcp" | "sessions" | "prompts" | "review" | "cloud";
const TABS: { id: TabId; label: string }[] = [
  { id: "session", label: "Session" },
  { id: "plugins", label: "Plugins" },
  { id: "mcp", label: "MCP" },
  { id: "sessions", label: "Sessions" },
  { id: "prompts", label: "Prompts" },
  { id: "review", label: "Review" },
  { id: "cloud", label: "Cloud" },
];

export default function CodexConsole({ agent }: { agent: AgentDetail }) {
  const [tab, setTab] = useState<TabId>("session");
  const [aligned, setAligned] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/codex/config").then((r) => r.json()).then((j) => setAligned(!!j.gatewayAligned)).catch(() => setAligned(false));
  }, []);

  const align = async () => {
    setAligned(null);
    const r = await fetch("/api/codex/config", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "align" }) }).then((x) => x.json()).catch(() => null);
    setAligned(!!r?.ok);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ background: CX.base, color: CX.ink }}>
      {/* hairline frame */}
      <div className="pointer-events-none absolute inset-2 rounded-xl" style={{ boxShadow: `inset 0 0 0 1px ${CX.line}` }} />
      {/* scanline vignette */}
      <div className="pointer-events-none absolute inset-0 z-0" style={{ background: "repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,0.10) 3px 4px)", mixBlendMode: "multiply" }} />

      {/* Hero over the cipher-rain */}
      <header className="relative shrink-0 overflow-hidden border-b px-8 py-6" style={{ borderColor: CX.line }}>
        <CipherRain />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-3xl" style={{ color: CX.accent, background: "rgba(16,163,127,0.08)", boxShadow: `inset 0 0 0 1px ${CX.accent}55, 0 0 24px ${CX.accent}22` }}>
              ▰
            </span>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.4em]" style={{ color: CX.dim }}>Cipher · OpenAI Codex</div>
              <h1 className="font-mono text-4xl font-bold uppercase tracking-[0.18em]" style={{ color: CX.ink, textShadow: `0 0 18px ${CX.accent}33` }}>Codex</h1>
              <p className="mt-1 max-w-xl text-sm" style={{ color: CX.dim }}>{agent.tagline}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: agent.status.installed ? CX.bright : CX.dim, background: "rgba(16,163,127,0.08)", border: `1px solid ${CX.accent}44` }}>
              {agent.status.installed ? "● ready" : "○ not installed"}
            </span>
            <button
              onClick={align}
              className="rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors"
              style={aligned ? { color: CX.bright, border: `1px solid ${CX.accent}66` } : { color: CX.dim, border: `1px solid ${CX.line}` }}
              title="Write ~/.codex/config.toml + AGENTS.md to run Codex on the free gateway"
            >
              {aligned === null ? "checking gateway…" : aligned ? "⛓ gateway-aligned" : "align to gateway"}
            </button>
          </div>
        </div>
      </header>

      {/* Chapter tabs */}
      <nav className="relative z-10 flex shrink-0 items-end gap-1 px-6" style={{ borderBottom: `1px solid ${CX.line}`, background: CX.surface }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className="relative px-4 py-2.5 font-mono text-[13px] uppercase tracking-wider transition-colors" style={{ color: active ? CX.accent : CX.dim }}>
              {t.label}
              {active && <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: CX.accent, boxShadow: `0 0 8px ${CX.accent}` }} />}
            </button>
          );
        })}
      </nav>

      {/* Body */}
      <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
        {/* Session — kept mounted so the PTY survives tab switches */}
        <div className="h-full" style={{ display: tab === "session" ? undefined : "none" }}>
          <div className="flex h-full flex-col p-5">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5" style={{ borderColor: CX.line, background: CX.surface }}>
              <span className="font-mono text-sm font-semibold" style={{ color: CX.accent }}>● Codex TUI</span>
              <span className="font-mono text-[11px]" style={{ color: CX.dim }}>live PTY · on the free gateway</span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden rounded-b-xl" style={{ border: `1px solid ${CX.line}`, borderTop: "none" }}>
              <NativeTerminal kind="codex" session="codex-main" accent={CX.accent} />
            </div>
          </div>
        </div>
        {tab === "plugins" && <div className="h-full overflow-hidden p-5"><CodexPlugins /></div>}
        {tab === "mcp" && <div className="h-full overflow-hidden p-5"><CodexMcp /></div>}
        {tab === "sessions" && <div className="h-full overflow-hidden p-5"><CodexSessions /></div>}
        {tab === "prompts" && <div className="h-full overflow-hidden p-5"><CodexPrompts /></div>}
        {tab === "review" && <div className="h-full overflow-hidden p-5"><CodexReview /></div>}
        {tab === "cloud" && <div className="h-full overflow-hidden p-5"><CodexCloud /></div>}
      </div>
    </div>
  );
}
