"use client";

import WanderMascots from "./WanderMascots";

/* ------------------------------------------------------------------ *
 * Cline's crawling skeleton — a little bone-frame carrying Cline's     *
 * diamond head, roaming the hero like Vibe's dogs. Cline is the         *
 * headless autonomous agent: a skeleton (no body of its own) wearing    *
 * the Cline glyph. 3–4 of them wander the header, persistent on the     *
 * Cline page. Mirrors VibeDog / ClaudeMascots, shared engine.           *
 * ------------------------------------------------------------------ */

const ACCENT = "#9d8cff";
const BONE = "#c8bdff";
const DARK = "#15102a";

/**
 * A crawling skeleton: a horizontal spine with rib nubs, four limbs
 * crawling forward, topped by the Cline diamond head. Side profile
 * facing right; the engine flips horizontally to face travel.
 */
function SkeletonGlyph({ size }: { size: number }) {
  const w = size * 1.9;
  const h = size * 1.3;
  return (
    <svg width={w} height={h} viewBox="0 0 52 34" aria-hidden>
      {/* crawling legs — animated to mimic forward scramble */}
      <g stroke={BONE} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <g style={{ transformOrigin: "16px 22px", animation: "mc-scramble-l 0.4s ease-in-out infinite" }}>
          <line x1="16" y1="22" x2="12" y2="30" />
          <line x1="12" y1="30" x2="8" y2="28" />
        </g>
        <g style={{ transformOrigin: "20px 22px", animation: "mc-scramble-r 0.4s ease-in-out infinite" }}>
          <line x1="20" y1="22" x2="22" y2="30" />
          <line x1="22" y1="30" x2="26" y2="28" />
        </g>
      </g>

      {/* bone spine — horizontal with rib nubs */}
      <g stroke={BONE} strokeWidth="1.8" strokeLinecap="round">
        <line x1="16" y1="18" x2="30" y2="18" />
        {/* rib nubs */}
        <line x1="19" y1="18" x2="19" y2="22" />
        <line x1="23" y1="18" x2="23" y2="22" />
        <line x1="27" y1="18" x2="27" y2="22" />
      </g>

      {/* front arms reaching forward to the diamond head */}
      <g style={{ transformOrigin: "30px 18px", animation: "mc-reach 0.5s ease-in-out infinite" }}>
        <line x1="30" y1="18" x2="36" y2="14" stroke={BONE} strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <g style={{ transformOrigin: "30px 20px", animation: "mc-reach 0.5s ease-in-out 0.25s infinite" }}>
        <line x1="30" y1="20" x2="37" y2="18" stroke={BONE} strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* Cline diamond head — glowing purple diamond, the signature glyph */}
      <g style={{ transformOrigin: "42px 12px", animation: "mc-breathe 2.4s ease-in-out infinite" }}>
        <path d="M42 4 L49 12 L42 20 L35 12 Z" fill={ACCENT} fillOpacity="0.22" stroke={ACCENT} strokeWidth="1.4" />
        <circle cx="42" cy="12" r="2.4" fill={DARK} stroke={ACCENT} strokeWidth="1.2" />
        <circle cx="42" cy="12" r="1" fill="#d6c9ff" />
      </g>

      {/* keyframes for the crawl */}
      <style>{`
        @keyframes mc-scramble-l {
          0%, 100% { transform: rotate(-8deg); }
          50% { transform: rotate(12deg); }
        }
        @keyframes mc-scramble-r {
          0%, 100% { transform: rotate(12deg); }
          50% { transform: rotate(-8deg); }
        }
        @keyframes mc-reach {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(8deg); }
        }
      `}</style>
    </svg>
  );
}

export default function ClineSkeleton() {
  return (
    <WanderMascots
      count={5}
      sizeRange={[20, 32]}
      renderSprite={({ size }) => <SkeletonGlyph size={size} />}
    />
  );
}
