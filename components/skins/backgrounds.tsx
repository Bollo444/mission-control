"use client";

/*
  One bespoke background per agent. Each uses a different visual grammar —
  ember light, classical god-light, parametric curves, dot-matrix, deep space,
  hex tessellation, audio ripples, blueprint — plus a per-agent iridescent
  "polarized" sheen so the surface pops. No two share a structure.
*/

const WRAP = "pointer-events-none absolute inset-0 overflow-hidden";

function Iridescence({ blend = "screen", opacity = 0.22, hue = 0 }: { blend?: string; opacity?: number; hue?: number }) {
  return (
    <div
      className="mc-iris-layer absolute inset-0"
      style={{
        opacity,
        mixBlendMode: blend as React.CSSProperties["mixBlendMode"],
        filter: `hue-rotate(${hue}deg)`,
        background:
          "conic-gradient(from 0deg, #ff5e87, #ffd86b, #5cffb0, #46d2ff, #9d6bff, #ff5e87)",
      }}
    />
  );
}

/* Claude — warm ember field with drifting sparks. */
export function ClaudeBg({ className = "" }: { className?: string }) {
  const sparks = Array.from({ length: 18 });
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 85% -10%, rgba(224,145,95,0.30), transparent 55%), radial-gradient(90% 70% at 10% 110%, rgba(168,90,50,0.22), transparent 60%)",
        }}
      />
      {sparks.map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${(i * 53) % 100}%`,
            top: `${(i * 31) % 100}%`,
            width: 3 + (i % 3),
            height: 3 + (i % 3),
            background: "#ffd9b0",
            opacity: 0.5,
            boxShadow: "0 0 8px #e0915f",
            animation: `mc-drift ${6 + (i % 5)}s ease-in-out ${i * 0.3}s infinite`,
          }}
        />
      ))}
      <Iridescence blend="overlay" opacity={0.16} hue={-20} />
    </div>
  );
}

/* Hermes — classical god-light: rotating divine rays, drifting clouds, gold + a Greek-key hem. */
export function HermesBg({ className = "" }: { className?: string }) {
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 120% at 50% -30%, rgba(232,198,107,0.30), rgba(20,18,30,0) 55%), linear-gradient(180deg, #14121e 0%, #0c0a14 100%)",
        }}
      />
      {/* divine rays */}
      <div
        className="mc-anim-spin absolute left-1/2 top-[-40%] h-[180%] w-[180%] -translate-x-1/2"
        style={{
          background:
            "repeating-conic-gradient(from 0deg at 50% 0%, rgba(255,225,150,0.10) 0deg 4deg, transparent 4deg 14deg)",
          maskImage: "radial-gradient(60% 70% at 50% 0%, #000 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(60% 70% at 50% 0%, #000 0%, transparent 70%)",
        }}
      />
      {/* drifting clouds */}
      <div
        className="absolute inset-x-0 top-6 h-40"
        style={{
          background:
            "radial-gradient(40% 60% at 25% 50%, rgba(255,240,210,0.10), transparent 70%), radial-gradient(50% 70% at 70% 40%, rgba(255,240,210,0.08), transparent 70%)",
          animation: "mc-cloud 18s ease-in-out infinite",
        }}
      />
      {/* marble veining sheen */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.05) 45%, transparent 60%)",
          backgroundSize: "200% 100%",
          animation: "mc-shimmer 9s linear infinite",
        }}
      />
      {/* Greek-key meander hem */}
      <svg className="absolute bottom-0 left-0 h-7 w-full" viewBox="0 0 120 14" preserveAspectRatio="none" aria-hidden>
        <pattern id="meander" width="14" height="14" patternUnits="userSpaceOnUse">
          <path d="M1 13 V4 H10 V10 H5 V7" fill="none" stroke="#e8c66b" strokeOpacity="0.45" strokeWidth="1" />
        </pattern>
        <rect width="120" height="14" fill="url(#meander)" />
      </svg>
    </div>
  );
}

/* Pi — parametric sine/Lissajous curves over a faint math grid. */
export function PiBg({ className = "" }: { className?: string }) {
  const curves = [
    { d: "M0 120 C120 40 240 200 360 90 S600 20 760 130", o: 0.5, dur: 3 },
    { d: "M0 80 C150 180 300 10 460 120 S720 60 800 160", o: 0.3, dur: 4 },
    { d: "M0 160 C100 60 260 210 420 70 S680 180 800 60", o: 0.35, dur: 5 },
  ];
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(100% 80% at 15% 0%, rgba(92,214,160,0.16), transparent 55%), #08120d",
          backgroundImage:
            "linear-gradient(rgba(92,214,160,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(92,214,160,0.05) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 30px 30px, 30px 30px",
        }}
      />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 800 220" preserveAspectRatio="none" aria-hidden>
        {curves.map((c, i) => (
          <path
            key={i}
            d={c.d}
            fill="none"
            stroke="#5cd6a0"
            strokeOpacity={c.o}
            strokeWidth="1.5"
            strokeDasharray="1400"
            strokeDashoffset="1400"
            style={{ animation: `mc-dash ${c.dur}s ease-out forwards, mc-breathe 6s ease-in-out ${i}s infinite` }}
          />
        ))}
      </svg>
      <Iridescence blend="screen" opacity={0.14} hue={90} />
    </div>
  );
}

/* OpenCode — amber dot-matrix halftone with a sweeping scanline. */
export function OpenCodeBg({ className = "" }: { className?: string }) {
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: "#0c0a16",
          backgroundImage:
            "radial-gradient(rgba(157,140,255,0.5) 1px, transparent 1.6px)",
          backgroundSize: "14px 14px",
          maskImage: "radial-gradient(120% 100% at 70% 30%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(120% 100% at 70% 30%, #000 30%, transparent 80%)",
        }}
      />
      <div
        className="absolute inset-x-0 h-16"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(157,140,255,0.18), transparent)",
          animation: "mc-scan 5s linear infinite",
        }}
      />
      {[12, 48, 78].map((l, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${l}%`,
            top: `${20 + i * 22}%`,
            width: 40 - i * 8,
            height: 6,
            background: "rgba(157,140,255,0.25)",
            animation: `mc-blink ${1.5 + i}s steps(2) infinite`,
          }}
        />
      ))}
    </div>
  );
}

/* Antigravity — deep space, floating particles + perspective horizon grid. */
export function AntigravityBg({ className = "" }: { className?: string }) {
  const stars = Array.from({ length: 30 });
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(100% 80% at 80% 10%, rgba(110,168,254,0.22), transparent 55%), radial-gradient(80% 60% at 20% 90%, rgba(157,140,255,0.16), transparent 60%), #070a14",
        }}
      />
      {stars.map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${(i * 37) % 100}%`,
            top: `${(i * 61) % 100}%`,
            width: i % 4 === 0 ? 2.5 : 1.5,
            height: i % 4 === 0 ? 2.5 : 1.5,
            opacity: 0.6,
            animation: `mc-float ${5 + (i % 6)}s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          backgroundImage:
            "linear-gradient(rgba(110,168,254,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(110,168,254,0.12) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          transform: "perspective(280px) rotateX(62deg)",
          transformOrigin: "bottom",
          maskImage: "linear-gradient(180deg, transparent, #000)",
          WebkitMaskImage: "linear-gradient(180deg, transparent, #000)",
        }}
      />
    </div>
  );
}

/* jcode — pulsing hex tessellation swarm. */
export function JcodeBg({ className = "" }: { className?: string }) {
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div className="absolute inset-0" style={{ background: "radial-gradient(100% 90% at 50% 0%, rgba(70,224,208,0.16), transparent 55%), #061513" }} />
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <pattern id="hexf" width="44" height="50" patternUnits="userSpaceOnUse" patternTransform="scale(1)">
            <path d="M22 2 L40 13 L40 35 L22 46 L4 35 L4 13 Z" fill="none" stroke="#46e0d0" strokeOpacity="0.22" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hexf)" />
      </svg>
      {[20, 55, 80].map((l, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: `${l}%`,
            top: `${25 + i * 18}%`,
            width: 30,
            height: 34,
            background: "rgba(70,224,208,0.18)",
            clipPath: "polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)",
            animation: `mc-breathe ${3 + i}s ease-in-out ${i * 0.4}s infinite`,
          }}
        />
      ))}
      <Iridescence blend="screen" opacity={0.12} hue={150} />
    </div>
  );
}

/* Vibe — concentric audio ripples + waveform, rose iridescence. */
export function VibeBg({ className = "" }: { className?: string }) {
  const rings = [0, 1, 2, 3];
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div className="absolute inset-0" style={{ background: "radial-gradient(90% 80% at 80% 20%, rgba(240,106,122,0.24), transparent 55%), #150810" }} />
      <div className="absolute right-[14%] top-[30%]">
        {rings.map((i) => (
          <span
            key={i}
            className="absolute block rounded-full border"
            style={{
              width: 60,
              height: 60,
              marginLeft: -30,
              marginTop: -30,
              borderColor: "rgba(240,106,122,0.4)",
              animation: `mc-ripple ${3.2}s ease-out ${i * 0.8}s infinite`,
            }}
          />
        ))}
      </div>
      <svg className="absolute inset-x-0 bottom-6 h-16 w-full" viewBox="0 0 400 60" preserveAspectRatio="none" aria-hidden>
        <path d="M0 30 Q20 5 40 30 T80 30 T120 30 T160 30 T200 30 T240 30 T280 30 T320 30 T360 30 T400 30" fill="none" stroke="#f06a7a" strokeOpacity="0.4" strokeWidth="1.5" className="mc-anim-breathe" />
      </svg>
      <Iridescence blend="overlay" opacity={0.18} hue={300} />
    </div>
  );
}

/* Kilo — steel isometric blueprint grid. */
export function KiloBg({ className = "" }: { className?: string }) {
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: "#0d1014",
          backgroundImage:
            "repeating-linear-gradient(60deg, rgba(192,198,212,0.10) 0 1px, transparent 1px 26px), repeating-linear-gradient(-60deg, rgba(192,198,212,0.10) 0 1px, transparent 1px 26px)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(80% 70% at 30% 20%, rgba(192,198,212,0.10), transparent 60%)",
        }}
      />
      <svg className="absolute right-6 top-6 h-20 w-20 opacity-50 mc-anim-spin" viewBox="0 0 80 80" style={{ transformOrigin: "40px 40px" }} aria-hidden>
        <circle cx="40" cy="40" r="30" fill="none" stroke="#c0c6d4" strokeWidth="0.7" strokeDasharray="3 4" />
        <line x1="40" y1="2" x2="40" y2="78" stroke="#c0c6d4" strokeOpacity="0.4" strokeWidth="0.6" />
        <line x1="2" y1="40" x2="78" y2="40" stroke="#c0c6d4" strokeOpacity="0.4" strokeWidth="0.6" />
      </svg>
    </div>
  );
}

/* OpenClaw — apex-predator scan HUD: rotating sonar wedge, raking claw-slash
   light, locking targeting brackets. Scarlet on warm oxblood so it reads as
   molten heat, not an alarm. */
export function OpenClawBg({ className = "" }: { className?: string }) {
  const slashes = [
    { top: "16%", delay: 0, dur: 5.2, len: 230 },
    { top: "44%", delay: 1.7, dur: 6.4, len: 320 },
    { top: "68%", delay: 3.2, dur: 5.6, len: 190 },
  ];
  return (
    <div className={`${WRAP} ${className}`} aria-hidden>
      {/* molten oxblood base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 78% 16%, rgba(255,68,56,0.26), transparent 55%), radial-gradient(70% 60% at 10% 94%, rgba(255,122,64,0.14), transparent 60%), #140809",
        }}
      />
      {/* rotating sonar sweep wedge */}
      <div
        className="absolute"
        style={{
          left: "64%",
          top: "8%",
          width: 460,
          height: 460,
          marginLeft: -230,
          marginTop: -230,
          borderRadius: 9999,
          background:
            "conic-gradient(from 0deg, rgba(255,68,56,0.24) 0deg, rgba(255,68,56,0.04) 26deg, transparent 64deg 360deg)",
          maskImage: "radial-gradient(closest-side, #000 58%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(closest-side, #000 58%, transparent 100%)",
          animation: "mc-spin 7s linear infinite",
          transformOrigin: "50% 50%",
        }}
      />
      {/* range rings + crosshair */}
      <svg
        className="absolute"
        style={{ left: "64%", top: "8%", width: 460, height: 460, marginLeft: -230, marginTop: -230 }}
        viewBox="0 0 460 460"
        aria-hidden
      >
        {[70, 140, 210].map((r, i) => (
          <circle key={i} cx="230" cy="230" r={r} fill="none" stroke="#ff4438" strokeOpacity={0.16 - i * 0.04} strokeWidth="1" />
        ))}
        <line x1="230" y1="14" x2="230" y2="446" stroke="#ff4438" strokeOpacity="0.1" strokeWidth="0.8" />
        <line x1="14" y1="230" x2="446" y2="230" stroke="#ff4438" strokeOpacity="0.1" strokeWidth="0.8" />
      </svg>
      {/* raking claw-slash light gashes */}
      {slashes.map((s, i) => (
        <span
          key={i}
          className="absolute"
          style={{ left: "-6%", top: s.top, transform: "rotate(27deg)" }}
        >
          <span
            className="block"
            style={{
              width: s.len,
              height: 2,
              background:
                "linear-gradient(90deg, transparent, rgba(255,140,110,0.95), rgba(255,68,56,0.25), transparent)",
              filter: "drop-shadow(0 0 6px rgba(255,68,56,0.65))",
              animation: `mc-rake ${s.dur}s ease-in-out ${s.delay}s infinite`,
            }}
          />
        </span>
      ))}
      {/* locking targeting brackets */}
      <svg
        className="absolute bottom-6 left-6 h-16 w-16"
        viewBox="0 0 64 64"
        aria-hidden
        style={{ animation: "mc-lock 3.2s ease-in-out infinite", transformOrigin: "32px 32px" }}
      >
        <path
          d="M6 18 V6 H18 M46 6 H58 V18 M58 46 V58 H46 M18 58 H6 V46"
          fill="none"
          stroke="#ff4438"
          strokeOpacity="0.6"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="32" cy="32" r="3" fill="#ff8c6e" />
      </svg>
      <Iridescence blend="overlay" opacity={0.1} hue={-30} />
    </div>
  );
}

export const BACKGROUNDS: Record<string, (p: { className?: string }) => React.ReactElement> = {
  claude: ClaudeBg,
  hermes: HermesBg,
  pi: PiBg,
  opencode: OpenCodeBg,
  antigravity: AntigravityBg,
  jcode: JcodeBg,
  vibe: VibeBg,
  kilo: KiloBg,
  openclaw: OpenClawBg,
};
