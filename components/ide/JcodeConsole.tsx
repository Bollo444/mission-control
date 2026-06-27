"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { AgentDetail } from "@/lib/types";
import { hexA } from "@/lib/format";
import { JcodeMascot } from "@/components/skins/mascots";
import MemoryEditor from "@/components/MemoryEditor";
import SessionList from "@/components/SessionList";
import ConfigViewer from "@/components/ConfigViewer";
import AgentMetrics from "@/components/AgentMetrics";
import LaunchControls from "@/components/LaunchControls";

/* ------------------------------------------------------------------ *
 * jcode — the swarm cockpit. A weightless teal void (Crash-jetpack    *
 * energy): hex shards, crates and swarm sparks drift in zero-G while  *
 * the live terminal hovers over them and the menu tabs float around.  *
 * ------------------------------------------------------------------ */

const J = {
  void: "#04110f",
  teal: "#46e0d0",
  tealBright: "#8ffff0",
  ink: "#d8f5f0",
  inkDim: "#7fb8b0",
  line: "#143b37",
};

const HEX_CLIP = "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)";

const JcodeTerminal = dynamic(() => import("@/components/ide/NativeTerminal"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm" style={{ color: J.inkDim }}>
      spinning up the swarm…
    </div>
  ),
});

// ---- Drifting void objects (deterministic so SSR/CSR match) -------------
type ObjKind = "hex" | "crate" | "node";
interface Drifter {
  kind: ObjKind;
  left: number; // %
  top: number; // %
  size: number; // px
  dur: number; // s
  delay: number; // s
  blur: number; // px (depth)
  opacity: number;
  front?: boolean; // foreground parallax layer
}

const DRIFTERS: Drifter[] = [
  // --- background field (behind the cockpit) ---
  { kind: "hex", left: 8, top: 18, size: 64, dur: 9, delay: 0, blur: 1, opacity: 0.55 },
  { kind: "crate", left: 22, top: 70, size: 46, dur: 12, delay: 1.5, blur: 0, opacity: 0.7 },
  { kind: "node", left: 14, top: 44, size: 10, dur: 7, delay: 0.5, blur: 0, opacity: 0.95 },
  { kind: "hex", left: 84, top: 22, size: 80, dur: 13, delay: 2, blur: 1, opacity: 0.45 },
  { kind: "crate", left: 90, top: 64, size: 38, dur: 11, delay: 0.8, blur: 0, opacity: 0.7 },
  { kind: "node", left: 78, top: 50, size: 8, dur: 8, delay: 1.2, blur: 0, opacity: 0.9 },
  { kind: "hex", left: 50, top: 6, size: 40, dur: 10, delay: 0.3, blur: 0, opacity: 0.65 },
  { kind: "crate", left: 60, top: 88, size: 52, dur: 14, delay: 2.6, blur: 0, opacity: 0.6 },
  { kind: "node", left: 38, top: 92, size: 12, dur: 7.5, delay: 0.9, blur: 0, opacity: 0.85 },
  { kind: "node", left: 92, top: 34, size: 7, dur: 6.5, delay: 0.2, blur: 0, opacity: 0.95 },
  // --- foreground swarm: drifts OVER the cockpit so motion never hides behind
  // terminal output. Kept semi-transparent + pointer-events-none. ---
  { kind: "node", left: 36, top: 30, size: 9, dur: 6, delay: 0, blur: 0, opacity: 0.85, front: true },
  { kind: "hex", left: 62, top: 36, size: 30, dur: 9, delay: 0.7, blur: 0, opacity: 0.5, front: true },
  { kind: "crate", left: 30, top: 62, size: 34, dur: 11, delay: 1.4, blur: 0, opacity: 0.45, front: true },
  { kind: "node", left: 68, top: 66, size: 11, dur: 7, delay: 0.4, blur: 0, opacity: 0.8, front: true },
  { kind: "hex", left: 48, top: 50, size: 22, dur: 8, delay: 2, blur: 0, opacity: 0.55, front: true },
  { kind: "node", left: 55, top: 24, size: 7, dur: 6.5, delay: 1.1, blur: 0, opacity: 0.9, front: true },
  { kind: "crate", left: 73, top: 48, size: 26, dur: 10, delay: 0.2, blur: 0, opacity: 0.4, front: true },
];

// A clearly-rotating swarm constellation around the cockpit — the "icon", now
// unmistakably alive. Radii are in vmin so the wide/tall orbits sweep OUTSIDE
// the terminal rectangle (into the void above, below and beside it), where no
// terminal output can ever cover them.
const SWARM: { r: string; dur: number }[] = [
  { r: "20vmin", dur: 18 },
  { r: "28vmin", dur: 26 },
  { r: "36vmin", dur: 34 },
  { r: "44vmin", dur: 44 },
  { r: "25vmin", dur: 22 },
];

function OrbitingSwarm() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      {/* breathing hub */}
      <span
        className="absolute"
        style={{ width: 26, height: 26, clipPath: HEX_CLIP, background: hexA(J.teal, 0.5), boxShadow: `0 0 24px 6px ${hexA(J.teal, 0.5)}`, animation: "mc-breathe 3.4s ease-in-out infinite" }}
      />
      {SWARM.map((s, i) => (
        <span key={i} className="absolute grid place-items-center" style={{ animation: `mc-orbit ${s.dur}s linear infinite`, ["--r" as string]: s.r }}>
          <span style={{ width: 18 + i * 3, height: 18 + i * 3, clipPath: HEX_CLIP, background: hexA(J.teal, 0.34 - i * 0.03), boxShadow: `inset 0 0 0 1px ${hexA(J.teal, 0.6)}, 0 0 16px ${hexA(J.teal, 0.3)}` }} />
        </span>
      ))}
    </div>
  );
}

function Drifter({ d }: { d: Drifter }) {
  const base = {
    position: "absolute" as const,
    left: `${d.left}%`,
    top: `${d.top}%`,
    width: d.size,
    height: d.size,
    filter: d.blur ? `blur(${d.blur}px)` : undefined,
    opacity: d.opacity,
    animation: `mc-weightless ${d.dur}s ease-in-out ${d.delay}s infinite`,
    willChange: "transform",
  };
  if (d.kind === "node") {
    return (
      <span
        style={{
          ...base,
          borderRadius: "999px",
          background: J.teal,
          boxShadow: `0 0 14px 3px ${hexA(J.teal, 0.8)}`,
        }}
      />
    );
  }
  if (d.kind === "crate") {
    // a Crash-style floating crate — teal-edged cube with corner rivets
    return (
      <span
        style={{
          ...base,
          borderRadius: 8,
          background: `linear-gradient(150deg, ${hexA(J.teal, 0.16)}, ${hexA("#021310", 0.7)})`,
          boxShadow: `inset 0 0 0 1.5px ${hexA(J.teal, 0.55)}, inset 0 0 18px ${hexA(J.teal, 0.12)}`,
        }}
      >
        <span className="absolute inset-1.5 rounded" style={{ boxShadow: `inset 0 0 0 1px ${hexA(J.teal, 0.2)}` }} />
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        clipPath: HEX_CLIP,
        background: hexA(J.teal, 0.14),
        boxShadow: `inset 0 0 0 1px ${hexA(J.teal, 0.45)}`,
      }}
    />
  );
}

// ---- Floating menu tabs --------------------------------------------------
type TabId = "swarm" | "memory" | "mcp" | "sessions" | "launch";
interface TabDef {
  id: TabId;
  glyph: string;
  label: string;
  pos: string; // tailwind position around the cockpit
  dur: number;
  delay: number;
}
const TABS: TabDef[] = [
  { id: "swarm", glyph: "◆", label: "Swarm", pos: "left-[7%] top-[16%]", dur: 12, delay: 0 },
  { id: "memory", glyph: "✦", label: "Memory", pos: "right-[8%] top-[14%]", dur: 14, delay: 1 },
  { id: "sessions", glyph: "⧉", label: "Sessions", pos: "left-[5%] top-[54%]", dur: 11, delay: 0.6 },
  { id: "mcp", glyph: "⇄", label: "MCP", pos: "right-[6%] top-[50%]", dur: 13, delay: 1.5 },
  { id: "launch", glyph: "⚙", label: "Launch", pos: "right-[16%] bottom-[12%]", dur: 15, delay: 0.9 },
];

function FloatingTab({ t, onOpen }: { t: TabDef; onOpen: () => void }) {
  return (
    // wrapper drifts; pause the drift on hover so it's an easy target
    <div className={`absolute z-20 ${t.pos} [animation-play-state:running] hover:[animation-play-state:paused]`}
      style={{ animation: `mc-weightless ${t.dur}s ease-in-out ${t.delay}s infinite` }}
    >
      <button
        onClick={onOpen}
        className="group flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-transform hover:-translate-y-0.5"
        style={{
          background: `linear-gradient(150deg, ${hexA(J.teal, 0.16)}, rgba(4,17,15,0.8))`,
          color: J.ink,
          backdropFilter: "blur(8px)",
          boxShadow: `inset 0 0 0 1px ${hexA(J.teal, 0.45)}, 0 0 30px -10px ${hexA(J.teal, 0.5)}`,
        }}
      >
        <span
          className="grid h-7 w-7 place-items-center text-[15px] transition-transform group-hover:scale-110"
          style={{ clipPath: HEX_CLIP, background: hexA(J.teal, 0.2), color: J.tealBright }}
        >
          {t.glyph}
        </span>
        {t.label}
      </button>
    </div>
  );
}

// ---- A swarm showcase for the Swarm tab ---------------------------------
function SwarmShowcase({ agent }: { agent: AgentDetail }) {
  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-5">
        <span className="grid h-24 w-24 shrink-0 place-items-center" style={{ filter: `drop-shadow(0 0 18px ${hexA(J.teal, 0.5)})` }}>
          <JcodeMascot size={92} />
        </span>
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.28em]" style={{ color: J.teal }}>
            Swarm · ambient · memory
          </div>
          <p className="mt-1 max-w-md text-sm" style={{ color: J.inkDim }}>
            jcode fans a task out across a swarm of agents, keeps an ambient watch on the
            workspace, and remembers what it learns. The terminal behind you is the real thing — type into it.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {agent.tools.map((t) => (
          <span
            key={t}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ background: hexA(J.teal, 0.1), color: J.ink, boxShadow: `inset 0 0 0 1px ${hexA(J.teal, 0.3)}` }}
          >
            {t}
          </span>
        ))}
      </div>
      <AgentMetrics agent={agent} />
    </div>
  );
}

// ---- The floating panel a tab opens -------------------------------------
function FloatingPanel({ title, glyph, onClose, children }: { title: string; glyph: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center p-4 sm:p-8" style={{ background: "rgba(2,10,9,0.5)" }} onClick={onClose}>
      <div
        className="mc-rise flex max-h-[78vh] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: `linear-gradient(160deg, ${hexA(J.teal, 0.08)}, rgba(4,15,13,0.96))`,
          backdropFilter: "blur(10px)",
          boxShadow: `inset 0 0 0 1px ${hexA(J.teal, 0.4)}, 0 0 80px -16px ${hexA(J.teal, 0.45)}, 0 30px 90px -20px rgba(0,0,0,0.8)`,
          animation: "mc-float 9s ease-in-out infinite",
        }}
      >
        <header className="flex shrink-0 items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${J.line}` }}>
          <div className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center text-base" style={{ clipPath: HEX_CLIP, background: hexA(J.teal, 0.18), color: J.tealBright }}>
              {glyph}
            </span>
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: J.ink }}>{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-lg" style={{ color: J.inkDim }}>
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ---- Main ----------------------------------------------------------------
export default function JcodeConsole({ agent }: { agent: AgentDetail }) {
  const a = agent;
  const [tab, setTab] = useState<TabId | null>(null);
  const teal = J.teal;
  const open = tab !== null;

  const tabMeta = TABS.find((t) => t.id === tab);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: J.void }}>
      {/* Void: teal glow + hex grid */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(120% 100% at 50% 18%, ${hexA(teal, 0.14)}, transparent 60%), ${J.void}` }} />
      <svg className="absolute inset-0 h-full w-full opacity-60" aria-hidden>
        <defs>
          <pattern id="jhex" width="44" height="50" patternUnits="userSpaceOnUse">
            <path d="M22 2 L40 13 L40 35 L22 46 L4 35 L4 13 Z" fill="none" stroke={teal} strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#jhex)" />
      </svg>

      {/* Drifting swarm objects (behind the cockpit) */}
      <div className="absolute inset-0 z-0">
        {DRIFTERS.filter((d) => !d.front).map((d, i) => <Drifter key={i} d={d} />)}
      </div>

      {/* The orbiting swarm constellation — clearly alive, read through the glass */}
      <div className="absolute inset-0 z-0">
        <OrbitingSwarm />
      </div>

      {/* Identity badge — minimal, lets the void breathe */}
      <div className="pointer-events-none absolute left-6 top-5 z-20 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center" style={{ filter: `drop-shadow(0 0 10px ${hexA(teal, 0.6)})` }}>
          <JcodeMascot size={40} />
        </span>
        <div className="leading-tight">
          <div className="font-mono text-sm font-semibold tracking-tight" style={{ color: J.ink }}>jcode</div>
          <div className="font-mono text-[10px] uppercase tracking-[0.24em]" style={{ color: J.inkDim }}>swarm cockpit</div>
        </div>
      </div>
      <div className="pointer-events-none absolute right-6 top-5 z-20 text-right font-mono text-[11px]" style={{ color: J.inkDim }}>
        <div style={{ color: a.status.installed ? teal : J.inkDim }}>{a.status.installed ? "● READY" : "○ OFFLINE"}</div>
        <div>{a.status.version || "installed"}</div>
      </div>

      {/* The hovering cockpit terminal — dead center, floats, tilts slightly */}
      <div className="absolute inset-0 grid place-items-center px-4" style={{ perspective: "1400px" }}>
        <div
          className="w-full max-w-[52vw] transition-all duration-500"
          style={{
            transform: "rotateX(2deg)",
            animation: "mc-float 7s ease-in-out infinite",
            opacity: open ? 0.4 : 1,
            filter: open ? "blur(2px)" : "none",
          }}
        >
          <div
            className="flex h-[54vh] flex-col overflow-hidden rounded-2xl"
            style={{
              // see-through cockpit glass — the drifting swarm reads behind the text
              background: "rgba(3,12,11,0.28)",
              backdropFilter: "blur(2px)",
              boxShadow: `inset 0 0 0 1px ${hexA(teal, 0.5)}, 0 0 90px -20px ${hexA(teal, 0.6)}, 0 40px 100px -30px rgba(0,0,0,0.9)`,
            }}
          >
            <div className="flex shrink-0 items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${J.line}` }}>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: teal }}>
                <span className="h-3 w-1 rounded-full" style={{ background: teal }} />
                jcode · swarm terminal · live
              </div>
              <span className="font-mono text-[11px]" style={{ color: J.inkDim }}>coding as you go · survives navigation</span>
            </div>
            <div className="min-h-0 flex-1">
              {a.status.installed ? (
                <JcodeTerminal kind="jcode" session="jcode-main" accent={teal} transparent />
              ) : (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div className="max-w-sm text-sm" style={{ color: J.inkDim }}>
                    jcode&apos;s live terminal appears here once it&apos;s installed.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Foreground parallax drifters — in front, soft */}
      <div className="pointer-events-none absolute inset-0 z-10">
        {DRIFTERS.filter((d) => d.front).map((d, i) => <Drifter key={i} d={d} />)}
      </div>

      {/* Floating menu tabs orbiting the cockpit */}
      {!open && TABS.map((t) => <FloatingTab key={t.id} t={t} onOpen={() => setTab(t.id)} />)}

      {/* Opened panel */}
      {open && tabMeta && (
        <FloatingPanel title={tabMeta.label} glyph={tabMeta.glyph} onClose={() => setTab(null)}>
          {tab === "swarm" && <SwarmShowcase agent={a} />}
          {tab === "memory" && (
            <div className="p-5">
              <MemoryEditor agentId={a.id} initial={a.memory} accent={teal} />
            </div>
          )}
          {tab === "mcp" && (
            <div className="p-5">
              <p className="mb-3 font-mono text-xs" style={{ color: J.inkDim }}>servers.json · config.toml — live on disk</p>
              <ConfigViewer configs={a.status.configs} accent={teal} />
            </div>
          )}
          {tab === "sessions" && (
            <div className="p-5">
              <SessionList sessions={a.sessions} accentFor={() => teal} />
            </div>
          )}
          {tab === "launch" && (
            <div className="p-5">
              <LaunchControls
                id={a.id}
                accent={teal}
                kind={a.kind}
                installed={a.status.installed}
                installCommand={a.install?.command}
                installUnverified={a.install?.unverified}
                onActed={() => {}}
              />
              {a.status.binPath && (
                <div className="mt-3 break-all font-mono text-[11px]" style={{ color: J.inkDim }}>binary · {a.status.binPath}</div>
              )}
            </div>
          )}
        </FloatingPanel>
      )}
    </div>
  );
}
