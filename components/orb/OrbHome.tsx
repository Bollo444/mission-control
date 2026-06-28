"use client";

import { useCallback, useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentsResp } from "@/lib/types";
import { relTime } from "@/lib/format";
import { OrchestrationRelay } from "@/components/ide/HermesConsole";
import OracleOrb from "./OracleOrb";
import CommandHud from "./CommandHud";
import FeaturePanel from "./FeaturePanel";
import JarvisVoice from "./JarvisVoice";
import { PETALS } from "./petals";

const PETAL = Object.fromEntries(PETALS.map((p) => [p.id, p]));

/* The home stage. The orb is the fixed center of attention; everything else is
 * summoned with "/" — the orb fades to glass and the edge HUD drifts in. */
export default function OrbHome() {
  const { data } = useFetch<AgentsResp>("/api/agents", 8000);
  const agents = data?.agents ?? [];

  const [hud, setHud] = useState(false);
  // active feature: { id, accent }
  const [active, setActive] = useState<{ id: string; accent: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [clock, setClock] = useState("");

  const ready = agents.filter((a) => a.status.installed).length;
  const sessions = agents.reduce((n, a) => n + a.status.sessionCount, 0);
  const lastActive = agents.map((a) => a.status.lastActive).filter(Boolean).sort().pop() as string | undefined;

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour12: false })), 1000);
    setClock(new Date().toLocaleTimeString([], { hour12: false }));
    return () => clearInterval(t);
  }, []);

  // "/" summons the HUD (unless typing); Esc backs out one layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing && !active) {
        e.preventDefault();
        setHud((v) => !v);
      } else if (e.key === "Escape") {
        if (active) setActive(null);
        else if (hud) setHud(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, hud]);

  const pick = useCallback((id: string, accent: string) => {
    setHud(false);
    setActive({ id, accent });
  }, []);

  const dim = hud || !!active;
  const activePetal = active ? PETAL[active.id] : null;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#06060a" }}>
      {/* Top telemetry ticker — Jarvis grammar, kept faint. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-6 px-8 py-4 font-mono text-[11px] tracking-[0.18em] text-[var(--color-ink-4)]">
        <span style={{ color: "var(--color-signal)" }}>◎ OLYMPUS ONLINE</span>
        <span>FLEET {ready}/{agents.length} READY</span>
        <span>{sessions} SESSIONS</span>
        <span>LAST {relTime(lastActive ?? null).toUpperCase()}</span>
        <span className="mc-stat-value text-[var(--color-ink-3)]">{clock}</span>
      </div>

      {/* The orb — dead center, fades to glass when a layer is open. */}
      <div className="absolute inset-0 grid place-items-center">
        <OracleOrb agents={agents} dim={dim} speaking={speaking} />
      </div>

      {/* Core hit-area — click the orb to summon the HUD (same as "/"). */}
      {!dim && (
        <button
          onClick={() => setHud(true)}
          aria-label="Open command HUD"
          title="Open command HUD"
          className="group absolute left-1/2 top-1/2 z-20 grid h-[20vmin] w-[20vmin] -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full transition-transform duration-300 ease-out hover:scale-105"
        >
          {/* faint glow ring that blooms on hover — discovery affordance */}
          <span
            className="pointer-events-none h-full w-full rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background:
                "radial-gradient(circle, rgba(245,183,90,0.16) 0%, rgba(245,183,90,0.06) 45%, transparent 70%)",
              boxShadow: "inset 0 0 60px -20px rgba(245,183,90,0.5)",
            }}
          />
        </button>
      )}

      {/* Talk to Jarvis — type and it answers; the core quickens while it speaks. */}
      {!dim && <JarvisVoice onSpeaking={setSpeaking} />}

      {/* The "/" edge HUD. */}
      {hud && <CommandHud agents={agents} onPick={pick} onClose={() => setHud(false)} />}

      {/* A revealed feature. Duo flow brings its own full overlay. */}
      {active && active.id === "duo" && <OrchestrationRelay onClose={() => setActive(null)} />}
      {activePetal && active && active.id !== "duo" && (
        <FeaturePanel
          glyph={activePetal.glyph}
          label={activePetal.label}
          accent={active.accent}
          onClose={() => setActive(null)}
        >
          {activePetal.render()}
        </FeaturePanel>
      )}
    </div>
  );
}
