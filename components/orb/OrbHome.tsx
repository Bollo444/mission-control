"use client";

import { useCallback, useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentsResp } from "@/lib/types";
import { relTime, hexA } from "@/lib/format";
import { OrchestrationRelay } from "@/components/ide/HermesConsole";
import OracleOrb, { type MicState } from "./OracleOrb";
import CommandHud from "./CommandHud";
import FeaturePanel from "./FeaturePanel";
import JarvisVoice from "./JarvisVoice";
import WeatherPanel from "./WeatherPanel";
import SystemMeter from "./SystemMeter";
import { PETALS } from "./petals";

const PETAL = Object.fromEntries(PETALS.map((p) => [p.id, p]));

const BURGUNDY = "#a12a4a";
const BURGUNDY_BRIGHT = "#d95f86";

/* The home stage. The orb is the fixed center of attention; everything else is
 * summoned with "/" — the orb fades to glass and the edge HUD drifts in.
 *
 * Immersive mode: while the center mic is armed (or Jarvis is speaking) the
 * chrome fades away — sidebar slides left, top ticker drifts up, bottom bar
 * sinks down — so the orb, truly centered on the viewport, is the only thing
 * on stage. */
export default function OrbHome() {
  const { data } = useFetch<AgentsResp>("/api/agents", 8000);
  const agents = data?.agents ?? [];

  const [hud, setHud] = useState(false);
  // active feature: { id, accent }
  const [active, setActive] = useState<{ id: string; accent: string } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  // The orb's center mic: off → listening for the wake word → capturing a command.
  const [mic, setMic] = useState<MicState>("off");
  const [clock, setClock] = useState("");
  const [fs, setFs] = useState(false);
  // The user's personal wake phrase (mirrors JarvisVoice's key) for the pill.
  const [wakePhrase, setWakePhrase] = useState("");

  const ready = agents.filter((a) => a.status.installed).length;
  const sessions = agents.reduce((n, a) => n + a.status.sessionCount, 0);
  const lastActive = agents.map((a) => a.status.lastActive).filter(Boolean).sort().pop() as string | undefined;

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString([], { hour12: false })), 1000);
    setClock(new Date().toLocaleTimeString([], { hour12: false }));
    return () => clearInterval(t);
  }, []);

  // Read the saved personal wake phrase so the pill shows the right words.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("mc.jarvis.wakephrase.v1");
      if (saved) setWakePhrase(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Immersive stage — mic armed or Jarvis speaking: flag <html> so the CSS
  // fades the sidebar/ticker/bar out and recenters the orb.
  const immersive = mic !== "off" || speaking;
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.orbActive = immersive ? "1" : "0";
    return () => {
      delete root.dataset.orbActive;
    };
  }, [immersive]);

  // Fullscreen — a visible toggle, plus the first user gesture anywhere on the
  // page enters fullscreen so Mission Control covers tabs/bookmarks.
  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const onFirst = () => {
      if (document.fullscreenElement || !document.fullscreenEnabled) return;
      void document.documentElement.requestFullscreen().catch(() => {});
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
    window.addEventListener("pointerdown", onFirst);
    window.addEventListener("keydown", onFirst);
    return () => {
      window.removeEventListener("pointerdown", onFirst);
      window.removeEventListener("keydown", onFirst);
    };
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
      {/* Top telemetry ticker — Jarvis grammar, kept faint. Drifts up off-stage
          during immersive mode. */}
      <div className="mc-orb-ticker pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-6 px-8 py-4 font-mono text-[11px] tracking-[0.18em] text-[var(--color-ink-4)]">
        <span style={{ color: "var(--color-signal)" }}>◎ OLYMPUS ONLINE</span>
        <span>FLEET {ready}/{agents.length} READY</span>
        <span>{sessions} SESSIONS</span>
        <span>LAST {relTime(lastActive ?? null).toUpperCase()}</span>
        <span className="mc-stat-value text-[var(--color-ink-3)]">{clock}</span>
      </div>

      {/* The orb — dead center of the *viewport* (the stage compensates for the
          sidebar, so it isn't off to the right), fades to glass when a layer
          is open. In immersive mode the sidebar leaves the flow and the stage
          drops its compensation — the orb stays exactly centered. */}
      <div className="mc-orb-stage absolute inset-0 grid place-items-center">
        <div className="relative grid place-items-center">
          <OracleOrb agents={agents} dim={dim} speaking={speaking} mic={mic} />

          {/* Core hit-area — click the middle of the orb to toggle the mic.
              (The "/" key still summons the HUD.) */}
          {!dim && (
            <button
              onClick={() => setMic((v) => (v === "off" ? "wake" : "off"))}
              aria-label={mic === "off" ? "Talk to Jarvis" : "Stop listening"}
              title={mic === "off" ? "Talk to Jarvis — wake word: “hey jarvis”" : "Stop listening"}
              className="group absolute inset-0 z-20 cursor-pointer rounded-full transition-transform duration-300 ease-out hover:scale-105"
            >
              {/* faint burgundy glow ring that blooms on hover — mic affordance */}
              <span
                className="pointer-events-none h-full w-full rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(circle, rgba(161,42,74,0.18) 0%, rgba(161,42,74,0.07) 45%, transparent 70%)",
                  boxShadow: "inset 0 0 60px -20px rgba(161,42,74,0.6)",
                }}
              />
            </button>
          )}
        </div>
      </div>

      {/* Wake status hint — floats just under the orb while the mic is armed
          (stays on stage; the bottom bar is the thing that sinks away). */}
      {mic !== "off" && (
        <div
          className="pointer-events-none absolute left-1/2 top-[calc(50%+33vmin)] z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1 text-[11px]"
          style={{
            background: hexA(BURGUNDY, 0.18),
            color: BURGUNDY_BRIGHT,
            boxShadow: `inset 0 0 0 1px ${hexA(BURGUNDY, 0.4)}`,
            backdropFilter: "blur(8px)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: BURGUNDY_BRIGHT, animation: "mc-mic-pulse 1.2s ease-in-out infinite" }}
          />
          {mic === "listen"
            ? "Listening… speak your command"
            : `Say “${wakePhrase || "hey jarvis"}” to wake`}
        </div>
      )}

      {/* Right-side weather — half-translucent 5-day forecast square
          (2 before / today / 2 after), collapsible to a small toggle. */}
      <WeatherPanel />

      {/* Right-side system meter — live CPU / memory / disk as three
          translucent bars, each in its own color. */}
      <SystemMeter />

      {/* Fullscreen toggle — Mission Control covers the whole screen, no
          tabs/bookmarks. The first click anywhere also enters fullscreen. */}
      <button
        onClick={toggleFs}
        title={fs ? "Exit fullscreen" : "Enter fullscreen"}
        aria-label={fs ? "Exit fullscreen" : "Enter fullscreen"}
        className="absolute right-5 top-5 z-40 grid h-9 w-9 place-items-center rounded-xl text-sm transition-colors hover:bg-white/10"
        style={{
          background: "rgba(8,8,12,0.5)",
          color: "var(--color-ink-3)",
          boxShadow: "inset 0 0 0 1px rgba(245,183,90,0.25)",
          backdropFilter: "blur(8px)",
        }}
      >
        {fs ? "✕" : "⛶"}
      </button>

      {/* Talk to Jarvis — type or talk and it answers; the core quickens while it speaks. */}
      {!dim && <JarvisVoice onSpeaking={setSpeaking} mic={mic} onMicChange={setMic} />}

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
