"use client";

/*
  One bespoke mascot per agent. Each is a self-contained animated SVG with its
  own motion language — deliberately nothing alike between any two.
*/

type MProps = { size?: number; className?: string };

/* Claude — a radiant ember asterisk: rotating rays around a breathing core. */
export function ClaudeMascot({ size = 64, className }: MProps) {
  const rays = Array.from({ length: 12 });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="cl-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd9b0" />
          <stop offset="55%" stopColor="#e0915f" />
          <stop offset="100%" stopColor="#a85a32" />
        </radialGradient>
      </defs>
      <g className="mc-anim-spin" style={{ transformOrigin: "50px 50px" }}>
        {rays.map((_, i) => (
          <rect
            key={i}
            x="49"
            y="6"
            width="2"
            height="20"
            rx="1"
            fill="#e0915f"
            opacity={i % 2 ? 0.45 : 0.9}
            transform={`rotate(${i * 30} 50 50)`}
          />
        ))}
      </g>
      <circle cx="50" cy="50" r="17" fill="url(#cl-core)" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
      <circle cx="50" cy="50" r="17" fill="none" stroke="#ffd9b0" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M50 40 L52 50 L50 60 L48 50 Z M40 50 L50 48 L60 50 L50 52 Z" fill="#fff6ec" opacity="0.85" transform="rotate(45 50 50)" />
    </svg>
  );
}

/* Hermes — a gilded caduceus: winged staff with two entwined serpents. */
export function HermesMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="he-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe9a8" />
          <stop offset="45%" stopColor="#e8c66b" />
          <stop offset="100%" stopColor="#9c7a22" />
        </linearGradient>
        <linearGradient id="he-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* wings */}
      <g className="mc-anim-float" style={{ transformOrigin: "50px 30px" }}>
        <path d="M50 24 C36 14 20 16 12 26 C26 24 38 27 48 33 Z" fill="url(#he-gold)" />
        <path d="M50 24 C64 14 80 16 88 26 C74 24 62 27 52 33 Z" fill="url(#he-gold)" />
        <circle cx="50" cy="20" r="5" fill="url(#he-gold)" />
      </g>
      {/* staff */}
      <rect x="48.5" y="28" width="3" height="58" rx="1.5" fill="url(#he-gold)" />
      {/* serpents */}
      <path d="M50 32 C38 40 62 48 50 56 C38 64 62 72 50 82" fill="none" stroke="url(#he-gold)" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 32 C62 40 38 48 50 56 C62 64 38 72 50 82" fill="none" stroke="#c9a44d" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      {/* shimmer sweep */}
      <rect x="0" y="0" width="40" height="100" fill="url(#he-sheen)" opacity="0.25" style={{ mixBlendMode: "overlay" }} className="mc-anim-float" />
    </svg>
  );
}

/* Pi — the constant rendered as a coiled serpent, drawn live (stroke-dash). */
export function PiMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="pi-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9bf3c8" />
          <stop offset="100%" stopColor="#36b87f" />
        </linearGradient>
      </defs>
      {/* serpentine sine spine */}
      <path
        d="M14 70 C28 40 40 40 50 58 C60 76 72 76 86 46"
        fill="none"
        stroke="url(#pi-g)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="160"
        strokeDashoffset="160"
        style={{ animation: "mc-dash 2.4s ease-out forwards, mc-iris 14s linear infinite" }}
      />
      {/* π glyph */}
      <g stroke="#5cd6a0" strokeWidth="6" strokeLinecap="round" fill="none">
        <line x1="28" y1="40" x2="74" y2="40" />
        <line x1="40" y1="40" x2="38" y2="74" />
        <line x1="62" y1="40" x2="64" y2="74" />
      </g>
      <circle cx="86" cy="46" r="4" fill="#5cd6a0" className="mc-anim-breathe" style={{ transformOrigin: "86px 46px" }} />
    </svg>
  );
}

/* Cline — the actual emblem: a pulsing diamond glyph. */
export function ClineEmblem({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <text
        x="50"
        y="58"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="72"
        fontWeight="700"
        fill="#9d8cff"
        className="mc-anim-breathe"
        style={{ transformOrigin: "50px 50px" }}
      >
        ◆
      </text>
    </svg>
  );
}

/* Cline — a purple diamond lattice with a pulsing core (headless autonomous agent). */
export function ClineMascot({ size = 64, className }: MProps) {
  const petals = Array.from({ length: 4 });
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#9d8cff" strokeWidth="2" strokeOpacity="0.4" />
      <g className="mc-anim-spin" style={{ transformOrigin: "50px 50px" }}>
        {petals.map((_, i) => (
          <rect
            key={i}
            x="46"
            y="14"
            width="8"
            height="36"
            rx="4"
            fill="#9d8cff"
            fillOpacity={0.1 + (i % 2) * 0.06}
            transform={`rotate(${i * 45} 50 50)`}
          />
        ))}
      </g>
      <path d="M50 32 L62 50 L50 68 L38 50 Z" fill="#9d8cff" fillOpacity="0.18" stroke="#9d8cff" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="6" fill="#15102a" stroke="#9d8cff" strokeWidth="2" />
      <circle cx="50" cy="50" r="2.5" fill="#d6c9ff" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
    </svg>
  );
}

/* Antigravity — an upward craft with two counter-rotating orbit rings, floating. */
export function AntigravityMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="ag-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bcd6ff" />
          <stop offset="100%" stopColor="#6ea8fe" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="50" rx="40" ry="15" fill="none" stroke="#6ea8fe" strokeOpacity="0.55" strokeWidth="2" className="mc-anim-spin" style={{ transformOrigin: "50px 50px" }} />
      <ellipse cx="50" cy="50" rx="15" ry="40" fill="none" stroke="#9d8cff" strokeOpacity="0.45" strokeWidth="2" style={{ transformOrigin: "50px 50px", animation: "mc-spin-rev 12s linear infinite" }} />
      <g className="mc-anim-float" style={{ transformOrigin: "50px 50px" }}>
        <path d="M50 24 L66 64 L50 56 L34 64 Z" fill="url(#ag-g)" />
        <circle cx="50" cy="44" r="5" fill="#0c1326" />
      </g>
    </svg>
  );
}

/* jcode — a swarm: central hex with orbiting hex satellites. */
export function JcodeMascot({ size = 64, className }: MProps) {
  const hex = "M0 -9 L8 -4.5 L8 4.5 L0 9 L-8 4.5 L-8 -4.5 Z";
  const sats = [0, 1, 2, 3, 4];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <g transform="translate(50 50)">
        <path d={hex} transform="scale(1.6)" fill="#46e0d0" fillOpacity="0.9" className="mc-anim-breathe" />
        {sats.map((i) => (
          <g key={i} style={{ animation: `mc-orbit ${6 + i}s linear infinite`, "--r": "30px" } as React.CSSProperties}>
            <path d={hex} transform="scale(0.7)" fill="#46e0d0" fillOpacity={0.5 - i * 0.06} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/* Vibe — a voice ring with a live equalizer (it has voice mode). */
export function VibeMascot({ size = 64, className }: MProps) {
  const bars = [0, 1, 2, 3, 4, 5, 6];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="40" fill="none" stroke="#f06a7a" strokeOpacity="0.4" strokeWidth="2" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#f06a7a" strokeWidth="2" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
      <g transform="translate(26 50)">
        {bars.map((i) => (
          <rect
            key={i}
            x={i * 7}
            y={-18}
            width="4"
            height="36"
            rx="2"
            fill="#f06a7a"
            style={{ transformOrigin: `${i * 7 + 2}px 0px`, animation: `mc-wave ${0.7 + (i % 3) * 0.25}s ease-in-out ${i * 0.08}s infinite` }}
          />
        ))}
      </g>
    </svg>
  );
}

/* OpenClaw — a mechanical grappling pincer that clamps open/closed around a
   targeting core, ringed by a slow dashed reticle. */
export function OpenClawMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="oc-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff9a7a" />
          <stop offset="45%" stopColor="#ff4438" />
          <stop offset="100%" stopColor="#b81f28" />
        </linearGradient>
      </defs>
      {/* dashed targeting reticle */}
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        stroke="#ff4438"
        strokeOpacity="0.35"
        strokeWidth="2"
        strokeDasharray="6 7"
        className="mc-anim-spin"
        style={{ transformOrigin: "50px 50px" }}
      />
      {/* hinge */}
      <circle cx="50" cy="64" r="5" fill="url(#oc-g)" />
      {/* left talon */}
      <g style={{ transformOrigin: "50px 64px", animation: "mc-grab 3s ease-in-out infinite" }}>
        <path d="M50 62 C40 52 36 40 40 26 C44 34 48 36 50 44 Z" fill="url(#oc-g)" />
        <path d="M40 26 C37 22 33 22 30 25" fill="none" stroke="#ff9a7a" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* right talon (mirror) */}
      <g style={{ transformOrigin: "50px 64px", animation: "mc-grab-rev 3s ease-in-out infinite" }}>
        <path d="M50 62 C60 52 64 40 60 26 C56 34 52 36 50 44 Z" fill="url(#oc-g)" />
        <path d="M60 26 C63 22 67 22 70 25" fill="none" stroke="#ff9a7a" strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* targeting core */}
      <circle cx="50" cy="50" r="6" fill="#1a0a0b" stroke="#ff4438" strokeWidth="2" />
      <circle cx="50" cy="50" r="2.4" fill="#ff9a7a" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
    </svg>
  );
}

/* Codex — the OpenAI hex-spark: a hexagonal cipher frame with a bold X
   crossing it, breathing at the vertex where the strokes meet. */
export function CodexMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="cx-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4fd1a8" />
          <stop offset="100%" stopColor="#10a37f" />
        </linearGradient>
      </defs>
      {/* hexagon frame */}
      <path
        d="M50 10 L85 30 L85 70 L50 90 L15 70 L15 30 Z"
        fill="none"
        stroke="url(#cx-g)"
        strokeWidth="2"
        strokeOpacity="0.5"
        className="mc-anim-spin"
        style={{ transformOrigin: "50px 50px", animationDuration: "22s" }}
      />
      {/* inner hex */}
      <path
        d="M50 22 L74 35 L74 65 L50 78 L26 65 L26 35 Z"
        fill="none"
        stroke="#10a37f"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      {/* the X — Codex's signature crossing */}
      <g stroke="url(#cx-g)" strokeWidth="7" strokeLinecap="round">
        <line x1="34" y1="34" x2="66" y2="66" />
        <line x1="66" y1="34" x2="34" y2="66" />
      </g>
      {/* vertex core */}
      <circle cx="50" cy="50" r="4.5" fill="#06281f" stroke="#4fd1a8" strokeWidth="2" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
    </svg>
  );
}

/* Sentinel — the vigil shield: a security escutcheon with a live radar sweep
   and a single watchful eye at its center. */
export function SentinelMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="sn-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f48fd0" />
          <stop offset="100%" stopColor="#d65db1" />
        </linearGradient>
      </defs>
      {/* radar arcs */}
      <g stroke="#d65db1" strokeOpacity="0.35" strokeWidth="1.4" fill="none">
        <path d="M50 16 A34 34 0 0 1 84 50" />
        <path d="M50 24 A26 26 0 0 1 76 50" />
      </g>
      {/* rotating radar sweep */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="17"
        stroke="#f48fd0"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="mc-anim-spin"
        style={{ transformOrigin: "50px 50px", animationDuration: "4.5s" }}
      />
      {/* shield */}
      <path
        d="M50 30 L68 36 L68 55 C68 68 60 76 50 80 C40 76 32 68 32 55 L32 36 Z"
        fill="rgba(214,93,177,0.08)"
        stroke="url(#sn-g)"
        strokeWidth="2.2"
      />
      {/* watchful eye */}
      <circle cx="50" cy="52" r="9" fill="#1c0f1d" stroke="#f48fd0" strokeWidth="1.6" />
      <circle cx="50" cy="52" r="3.4" fill="#f48fd0" className="mc-anim-breathe" style={{ transformOrigin: "50px 52px" }} />
      {/* scan line */}
      <rect x="33" y="60" width="34" height="1.4" rx="0.7" fill="#f48fd0" opacity="0.55" style={{ animation: "mc-scan 3.2s ease-in-out infinite" }} />
    </svg>
  );
}

export const MASCOTS: Record<string, (p: MProps) => React.ReactElement> = {
  claude: ClaudeMascot,
  hermes: HermesMascot,
  pi: PiMascot,
  cline: ClineMascot,
  antigravity: AntigravityMascot,
  jcode: JcodeMascot,
  vibe: VibeMascot,
  openclaw: OpenClawMascot,
  codex: CodexMascot,
  sentinel: SentinelMascot,
};
