"use client";

import { useMemo } from "react";
import type { AgentSummary } from "@/lib/types";
import { hexA } from "@/lib/format";
import { Caduceus } from "@/components/ide/HermesConsole";

/* ------------------------------------------------------------------ *
 * The Oracle Orb — Jarvis reactor geometry forged in Hermes gold.     *
 * Counter-rotating rings, a breathing plasma core etched with the     *
 * caduceus, sonar pulses, and one orbiting spark per fleet agent.     *
 * The very center is the mic: a translucent burgundy glyph that pulses*
 * lightly at rest and brightens when it's listening for a wake word   *
 * or capturing a command. Pure visual: it knows nothing about menus.  *
 * ------------------------------------------------------------------ */

const GOLD = "#f5b75a";
const GOLD_BRIGHT = "#ffd483";
const EMBER = "#e0915f";
// Burgundy — deep wine that contrasts the gold without shouting.
const BURGUNDY = "#a12a4a";
const BURGUNDY_BRIGHT = "#d95f86";

/** Twelve rim ticks — the decorative HUD scale (the live menu sits outside this). */
const TICKS = Array.from({ length: 48 });

export type MicState = "off" | "wake" | "listen";

/** The center mic glyph. Idle it swells up then fades completely transparent
 *  (a slow, faint pulse so the caduceus beneath reads clearly). Armed it stays
 *  fully transparent too — the orb's quickened rings and burgundy glow carry
 *  the active signal, so the Hermes logo is never covered. */
function CenterMic({ state }: { state: MicState }) {
  const active = state !== "off";
  return (
    <div
      className="pointer-events-none absolute inset-0 grid place-items-center"
      style={{
        opacity: active ? 0 : 1,
        transition: "opacity 0.5s ease",
        animation: active ? "none" : "mc-mic-pulse 7s ease-in-out infinite",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="relative"
        style={{
          width: "34%",
          height: "34%",
          color: hexA(BURGUNDY_BRIGHT, 0.85),
          filter: `drop-shadow(0 0 3px ${hexA(BURGUNDY, 0.35)})`,
        }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
        <path d="M5.5 11.5v0.6a6.5 6.5 0 0 0 13 0v-0.6" />
        <line x1="12" y1="18.6" x2="12" y2="21.5" />
      </svg>
    </div>
  );
}

export default function OracleOrb({
  agents,
  dim = false,
  speaking = false,
  mic = "off",
}: {
  agents: AgentSummary[];
  dim?: boolean;
  /** When Jarvis is replying — the core quickens and voice rings pulse out. */
  speaking?: boolean;
  /** Mic state — the center glyph pulses faster/brighter while listening. */
  mic?: MicState;
}) {
  const micActive = mic !== "off";
  // Engaged — the mic is armed or Jarvis is speaking: every ring spins
  // ~1.6x faster (a clearly-noticeable step, like 20 → 32 mph), while the
  // agent sparks keep their own pace so the constellation stays readable.
  const engaged = micActive || speaking;

  // One spark per agent, evenly phased around a shared orbit so the ring
  // rotates as a constellation rather than a scatter.
  const sparks = useMemo(
    () =>
      agents.map((a, i) => ({
        id: a.id,
        name: a.name,
        accent: a.accent,
        ready: a.status.installed,
        // negative delay distributes the phase; same duration keeps them locked.
        delay: -(i / Math.max(agents.length, 1)) * 36,
      })),
    [agents],
  );

  return (
    <div
      className="pointer-events-none relative grid aspect-square w-[min(64vmin,560px)] place-items-center transition-all duration-700"
      style={{
        opacity: dim ? 0.32 : 1,
        filter: dim ? "blur(3px) saturate(0.7)" : "none",
        transform: dim ? "scale(0.92)" : "scale(1)",
      }}
    >
      {/* Oxblood vignette — Hermes' deep ground bleeding behind the reactor. */}
      <div
        className="absolute inset-[-22%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(42,15,18,0.9) 0%, rgba(42,15,18,0.35) 42%, transparent 70%)",
        }}
      />

      {/* Sonar pulses — three staggered rings breathing outward. Idle they
          drift slowly and faintly; while Jarvis speaks (or the mic listens)
          they quicken and brighten. */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="absolute h-[58%] w-[58%] rounded-full"
          style={{
            border: `1px solid ${
              micActive ? hexA(BURGUNDY, speaking ? 0.8 : 0.5) : hexA(GOLD, speaking ? 0.8 : 0.35)
            }`,
            animation: `mc-ripple ${speaking ? 1.8 : micActive ? 2.2 : 7}s ease-out infinite`,
            animationDelay: `${i * (speaking ? 0.6 : micActive ? 0.7 : 2.3)}s`,
          }}
        />
      ))}

      {/* Outer compass ring — dashed gold, slow forward spin. */}
      <svg
        viewBox="0 0 200 200"
        className="absolute h-full w-full"
        style={{ animation: `mc-spin ${engaged ? 56 : 90}s linear infinite` }}
        aria-hidden
      >
        <circle
          cx="100"
          cy="100"
          r="96"
          fill="none"
          stroke={hexA(GOLD, 0.28)}
          strokeWidth="0.6"
          strokeDasharray="1 5"
        />
        {/* 48 rim ticks — every 4th is a long major mark. */}
        {TICKS.map((_, i) => {
          const major = i % 4 === 0;
          return (
            <line
              key={i}
              x1="100"
              y1={major ? 6 : 9}
              x2="100"
              y2={major ? 13 : 11}
              stroke={hexA(GOLD, major ? 0.65 : 0.3)}
              strokeWidth={major ? 0.8 : 0.5}
              transform={`rotate(${(i / TICKS.length) * 360} 100 100)`}
            />
          );
        })}
      </svg>

      {/* Inner ring — counter-rotating, gapped (the reactor armature). */}
      <svg
        viewBox="0 0 200 200"
        className="absolute h-[78%] w-[78%]"
        style={{ animation: `mc-spin-rev ${engaged ? 31 : 50}s linear infinite` }}
        aria-hidden
      >
        <circle
          cx="100"
          cy="100"
          r="90"
          fill="none"
          stroke={hexA(EMBER, 0.55)}
          strokeWidth="1.4"
          strokeDasharray="40 24"
          strokeLinecap="round"
        />
      </svg>

      {/* Third ring — thin bright gold, forward, tighter. */}
      <svg
        viewBox="0 0 200 200"
        className="absolute h-[60%] w-[60%]"
        style={{ animation: `mc-spin ${engaged ? 20 : 32}s linear infinite` }}
        aria-hidden
      >
        <circle
          cx="100"
          cy="100"
          r="88"
          fill="none"
          stroke={hexA(GOLD_BRIGHT, 0.7)}
          strokeWidth="1"
          strokeDasharray="2 10"
        />
      </svg>

      {/* Orbiting agent sparks — one per agent, locked into one rotating ring. */}
      <div className="absolute inset-0">
        {sparks.map((s) => (
          <div key={s.id} className="absolute inset-0 grid place-items-center">
            <span
              className="absolute grid place-items-center"
              style={{
                animation: "mc-orbit 36s linear infinite",
                animationDelay: `${s.delay}s`,
                ["--r" as string]: "min(24vmin,210px)",
              }}
              title={`${s.name} · ${s.ready ? "ready" : "offline"}`}
            >
              <span
                className="block rounded-full"
                style={{
                  width: s.ready ? 9 : 6,
                  height: s.ready ? 9 : 6,
                  background: s.accent,
                  boxShadow: `0 0 12px 2px ${hexA(s.accent, 0.8)}`,
                  opacity: s.ready ? 1 : 0.45,
                }}
              />
            </span>
          </div>
        ))}
      </div>

      {/* The core — breathing plasma with the caduceus etched into it. */}
      <div
        className="relative grid h-[38%] w-[38%] place-items-center rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 42%, ${GOLD_BRIGHT} 0%, ${GOLD} 34%, ${hexA(EMBER, 0.5)} 62%, transparent 78%)`,
          boxShadow: `0 0 ${speaking ? 90 : micActive ? 82 : 46}px ${speaking ? 12 : micActive ? 11 : 5}px ${
            micActive ? hexA(BURGUNDY, speaking ? 0.75 : 0.55) : hexA(GOLD, speaking ? 0.75 : 0.45)
          }, inset 0 0 40px ${hexA("#7a3a12", 0.6)}`,
          animation: `${micActive ? "mc-breathe" : "mc-breathe-soft"} ${
            speaking ? 1.1 : micActive ? 1.4 : 7
          }s ease-in-out infinite`,
        }}
      >
        {/* dark medallion so the caduceus reads against the glare */}
        <span
          className="grid h-[74%] w-[74%] place-items-center rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(8,4,5,0.92) 0%, rgba(20,8,9,0.7) 70%, transparent 100%)",
          }}
        >
          <span style={{ opacity: micActive ? 1 : 0.92, transition: "opacity 0.6s" }}>
            <Caduceus size={64} />
          </span>
        </span>

        {/* The mic — translucent burgundy, pulsing at the very center. */}
        <CenterMic state={mic} />
      </div>
    </div>
  );
}
