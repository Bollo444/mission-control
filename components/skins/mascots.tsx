"use client";

/*
  Original mascots for every agent on the roster. Each one is a self-
  contained animated SVG with its own silhouette and motion language -
  nothing uses a vendor logo, and no two read as the same template.
  viewBox is 100x100 for all so they share a stage at any size.
*/

import * as React from "react";

type MProps = { size?: number; className?: string };

/* hermes - gold. */
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
          <stop offset="50%" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="mc-anim-float" style={{ transformOrigin: "50px 30px" }}>
        <path d="M50 24 C36 14 20 16 12 26 C26 24 38 27 48 33 Z" fill="url(#he-gold)" />
        <path d="M50 24 C64 14 80 16 88 26 C74 24 62 27 52 33 Z" fill="url(#he-gold)" />
        <circle cx="50" cy="20" r="5" fill="url(#he-gold)" />
      </g>
      <rect x="48.5" y="28" width="3" height="58" rx="1.5" fill="url(#he-gold)" />
      <path d="M50 32 C38 40 62 48 50 56 C38 64 62 72 50 82" fill="none" stroke="url(#he-gold)" strokeWidth="3" strokeLinecap="round" />
      <path d="M50 32 C62 40 38 48 50 56 C62 64 38 72 50 82" fill="none" stroke="#c9a44d" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
      <rect x="0" y="0" width="40" height="100" fill="url(#he-sheen)" opacity="0.3" style={{ mixBlendMode: "overlay" }} className="mc-anim-float" />
    </svg>
  );
}

/* claude - ember. */
export function ClaudeMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="cl-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd9b0" />
          <stop offset="55%" stopColor="#e0915f" />
          <stop offset="100%" stopColor="#a85a32" />
        </radialGradient>
      </defs>
      <g stroke="url(#cl-core)" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d="M50 86 L50 50 L26 28" />
        <path d="M50 86 L50 50 L74 28" />
        <path d="M50 50 L36 22" opacity="0.7" />
        <path d="M50 50 L64 22" opacity="0.7" />
        <path d="M26 28 L18 32" opacity="0.55" />
        <path d="M74 28 L82 32" opacity="0.55" />
      </g>
      <circle cx="50" cy="50" r="11" fill="url(#cl-core)" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
      <circle cx="50" cy="50" r="11" fill="none" stroke="#ffd9b0" strokeOpacity="0.5" strokeWidth="1" />
    </svg>
  );
}

/* pi - mint. */
export function PiMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="pi-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c8fff0" />
          <stop offset="100%" stopColor="#3aa890" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="#7ce0c8">
        <circle cx="50" cy="50" r="36" strokeOpacity="0.35" strokeWidth="1.4" />
        <circle cx="50" cy="50" r="24" strokeOpacity="0.6" strokeWidth="1.8" className="mc-anim-spin" style={{ transformOrigin: "50px 50px", animationDuration: "22s" }} />
        <circle cx="50" cy="50" r="13" strokeOpacity="0.85" strokeWidth="2" className="mc-anim-spin" style={{ transformOrigin: "50px 50px", animationDuration: "11s", animationDirection: "reverse" }} />
      </g>
      <g fill="#7ce0c8" fontFamily="monospace" fontSize="9" fontWeight="700">
        <circle cx="50" cy="14" r="2" />
        <circle cx="86" cy="50" r="2" />
        <circle cx="50" cy="86" r="2" />
        <circle cx="14" cy="50" r="2" />
      </g>
      <g className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }}>
        <path d="M34 42 H66 V46 H52 V58 H46 V46 H34 Z" fill="url(#pi-core)" />
        <rect x="46" y="46" width="3.4" height="14" fill="url(#pi-core)" />
        <rect x="52.5" y="46" width="3.4" height="14" fill="url(#pi-core)" />
      </g>
    </svg>
  );
}

/* cline - violet. */
export function ClineMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="cl-trunk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbb2ff" />
          <stop offset="100%" stopColor="#6a5cff" />
        </linearGradient>
      </defs>
      <rect x="48" y="80" width="4" height="14" fill="url(#cl-trunk)" rx="2" />
      <g stroke="url(#cl-trunk)" strokeWidth="3.4" strokeLinecap="round" fill="none">
        <path d="M50 80 C50 60 30 50 18 36" opacity="0.45" />
        <path d="M50 80 C50 64 38 56 30 38" opacity="0.6" />
        <path d="M50 80 C50 64 62 56 70 38" opacity="0.6" />
        <path d="M50 80 C50 60 70 50 82 36" opacity="0.45" />
      </g>
      <g className="mc-anim-pulse">
        <path d="M50 80 C50 60 36 52 28 32" stroke="#bbb2ff" strokeWidth="4" strokeLinecap="round" fill="none" />
        <circle cx="28" cy="32" r="6" fill="#bbb2ff" />
        <circle cx="28" cy="32" r="11" fill="none" stroke="#bbb2ff" strokeOpacity="0.5" strokeWidth="1.5" />
      </g>
      <g fill="#6a5cff">
        <circle cx="18" cy="36" r="3.4" opacity="0.7" />
        <circle cx="30" cy="38" r="3.4" opacity="0.85" />
        <circle cx="70" cy="38" r="3.4" opacity="0.85" />
        <circle cx="82" cy="36" r="3.4" opacity="0.7" />
      </g>
    </svg>
  );
}

/* antigravity - azure. */
export function AntigravityMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="ag-g" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#dbe9ff" />
          <stop offset="60%" stopColor="#9bc8ff" />
          <stop offset="100%" stopColor="#3a6dbb" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="74" rx="32" ry="6" fill="none" stroke="#9bc8ff" strokeOpacity="0.6" strokeWidth="1.5" />
      <ellipse cx="50" cy="74" rx="22" ry="4" fill="none" stroke="#9bc8ff" strokeOpacity="0.4" strokeWidth="1" />
      <g className="mc-anim-float" style={{ transformOrigin: "50px 42px" }}>
        <path d="M50 18 L72 40 L50 64 L28 40 Z" fill="url(#ag-g)" stroke="#dbe9ff" strokeWidth="1.5" />
        <path d="M50 18 L72 40 L50 40 Z" fill="#dbe9ff" opacity="0.55" />
        <path d="M50 40 L28 40 L50 64 Z" fill="#3a6dbb" opacity="0.5" />
        <path d="M50 18 L50 40 L72 40" fill="none" stroke="#dbe9ff" strokeOpacity="0.7" strokeWidth="1" />
        <path d="M50 40 L50 64" stroke="#dbe9ff" strokeOpacity="0.7" strokeWidth="1" />
      </g>
      <circle cx="18" cy="74" r="2.4" fill="#dbe9ff" className="mc-anim-breathe" style={{ transformOrigin: "18px 74px" }} />
      <circle cx="82" cy="74" r="2.4" fill="#dbe9ff" className="mc-anim-breathe" style={{ transformOrigin: "82px 74px", animationDelay: "0.6s" }} />
    </svg>
  );
}

/* openclaw - crimson. */
export function OpenClawMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="oc-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd0c0" />
          <stop offset="60%" stopColor="#e85d5d" />
          <stop offset="100%" stopColor="#7a1f1f" />
        </radialGradient>
      </defs>
      <g fill="none" stroke="#e85d5d" strokeWidth="6" strokeLinecap="round">
        <path d="M18 24 C30 36 38 50 46 56" />
        <path d="M82 24 C70 36 62 50 54 56" />
        <path d="M50 14 C50 30 50 46 50 56" />
      </g>
      <g fill="#e85d5d">
        <circle cx="46" cy="56" r="3.6" />
        <circle cx="54" cy="56" r="3.6" />
        <circle cx="50" cy="56" r="3.6" />
      </g>
      <circle cx="50" cy="72" r="14" fill="url(#oc-glow)" className="mc-anim-pulse" />
      <circle cx="50" cy="72" r="20" fill="none" stroke="#e85d5d" strokeOpacity="0.4" strokeWidth="1.2" className="mc-anim-breathe" style={{ transformOrigin: "50px 72px" }} />
      <g stroke="#e85d5d" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round">
        <line x1="34" y1="86" x2="40" y2="86" />
        <line x1="60" y1="86" x2="66" y2="86" />
        <line x1="50" y1="92" x2="50" y2="96" />
      </g>
    </svg>
  );
}

/* jcode - cyan. */
export function JcodeMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id="jc-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d8f4ff" />
          <stop offset="100%" stopColor="#2089b8" />
        </radialGradient>
      </defs>
      <g stroke="#6ad8ff" strokeWidth="1.4" fill="none" opacity="0.7">
        <path d="M50 50 C30 30 14 50 22 70" />
        <path d="M50 50 C70 30 86 50 78 70" />
        <path d="M50 50 C20 60 30 86 50 76" />
        <path d="M50 50 C80 60 70 86 50 76" />
      </g>
      <g fill="#6ad8ff">
        <circle cx="22" cy="70" r="3" />
        <circle cx="78" cy="70" r="3" />
        <circle cx="50" cy="76" r="3" />
        <circle cx="14" cy="34" r="2.2" opacity="0.7" />
        <circle cx="86" cy="34" r="2.2" opacity="0.7" />
        <circle cx="50" cy="20" r="2.2" opacity="0.7" />
      </g>
      <g className="mc-anim-pulse" style={{ transformOrigin: "50px 50px" }}>
        <circle cx="50" cy="50" r="11" fill="url(#jc-core)" />
        <circle cx="50" cy="50" r="11" fill="none" stroke="#d8f4ff" strokeWidth="1" />
      </g>
      <g className="mc-anim-spin" style={{ transformOrigin: "50px 50px", animationDuration: "30s" }}>
        <circle cx="50" cy="50" r="29" fill="none" stroke="#6ad8ff" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="2 4" />
      </g>
    </svg>
  );
}

/* vibe - rose. */
export function VibeMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="vb-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffc4dd" />
          <stop offset="100%" stopColor="#c45a8e" />
        </linearGradient>
        <linearGradient id="vb-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8ec3" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ff8ec3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#vb-g)" strokeWidth="4" strokeLinecap="round">
        <path d="M22 56 Q50 24 78 56" />
        <path d="M30 62 Q50 38 70 62" opacity="0.85" />
        <path d="M38 66 Q50 50 62 66" opacity="0.7" />
      </g>
      <path d="M16 76 Q50 70 84 76 L84 92 L16 92 Z" fill="url(#vb-haze)" />
      <circle cx="50" cy="22" r="6" fill="#ff8ec3" className="mc-anim-breathe" style={{ transformOrigin: "50px 22px" }} />
      <circle cx="50" cy="22" r="6" fill="none" stroke="#ffc4dd" strokeWidth="1.5" />
    </svg>
  );
}

/* codex - teal. */
export function CodexMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="cx-pages" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dffcee" />
          <stop offset="100%" stopColor="#4fd1a8" />
        </linearGradient>
        <radialGradient id="cx-spark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#4fd1a8" />
          <stop offset="100%" stopColor="#1f7050" />
        </radialGradient>
      </defs>
      <g>
        <path d="M50 36 L20 44 L20 80 L50 76 Z" fill="url(#cx-pages)" stroke="#1f7050" strokeWidth="1.4" />
        <g stroke="#1f7050" strokeOpacity="0.55" strokeWidth="0.8">
          <line x1="26" y1="50" x2="48" y2="47" />
          <line x1="26" y1="58" x2="48" y2="55" />
          <line x1="26" y1="66" x2="48" y2="63" />
          <line x1="26" y1="74" x2="48" y2="71" />
        </g>
      </g>
      <g>
        <path d="M50 36 L80 44 L80 80 L50 76 Z" fill="url(#cx-pages)" stroke="#1f7050" strokeWidth="1.4" />
        <g stroke="#1f7050" strokeOpacity="0.55" strokeWidth="0.8">
          <line x1="52" y1="47" x2="74" y2="50" />
          <line x1="52" y1="55" x2="74" y2="58" />
          <line x1="52" y1="63" x2="74" y2="66" />
          <line x1="52" y1="71" x2="74" y2="74" />
        </g>
      </g>
      <line x1="50" y1="36" x2="50" y2="76" stroke="#1f7050" strokeWidth="1.6" />
      <g className="mc-anim-breathe" style={{ transformOrigin: "50px 24px" }}>
        <circle cx="50" cy="24" r="6" fill="url(#cx-spark)" />
        <g stroke="#dffcee" strokeWidth="1.4" strokeLinecap="round">
          <line x1="50" y1="10" x2="50" y2="16" />
          <line x1="50" y1="32" x2="50" y2="38" />
          <line x1="36" y1="24" x2="42" y2="24" />
          <line x1="58" y1="24" x2="64" y2="24" />
        </g>
      </g>
    </svg>
  );
}

/* sentinel - magenta. */
export function SentinelMascot({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="sn-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f48fd0" />
          <stop offset="100%" stopColor="#d65db1" />
        </linearGradient>
      </defs>
      <path d="M50 14 L80 30 L80 70 L50 86 L20 70 L20 30 Z" fill="none" stroke="url(#sn-g)" strokeWidth="2.4" />
      <path d="M50 24 L72 36 L72 64 L50 76 L28 64 L28 36 Z" fill="none" stroke="#d65db1" strokeOpacity="0.35" strokeWidth="1" />
      <line x1="50" y1="50" x2="50" y2="20" stroke="#f48fd0" strokeWidth="1.6" strokeLinecap="round" className="mc-anim-spin" style={{ transformOrigin: "50px 50px", animationDuration: "4.5s" }} />
      <path d="M50 50 A30 30 0 0 1 70 75" fill="none" stroke="#f48fd0" strokeOpacity="0.55" strokeWidth="1.4" className="mc-anim-spin" style={{ transformOrigin: "50px 50px", animationDuration: "4.5s" }} />
      <g>
        <circle cx="50" cy="50" r="9" fill="#1c0f1d" stroke="#f48fd0" strokeWidth="1.6" />
        <circle cx="50" cy="50" r="3.4" fill="#f48fd0" className="mc-anim-breathe" style={{ transformOrigin: "50px 50px" }} />
      </g>
      <g fill="#d65db1">
        <circle cx="50" cy="14" r="2" />
        <circle cx="80" cy="30" r="2" />
        <circle cx="80" cy="70" r="2" />
        <circle cx="50" cy="86" r="2" />
        <circle cx="20" cy="70" r="2" />
        <circle cx="20" cy="30" r="2" />
      </g>
    </svg>
  );
}

/* Cline emblem (used on the agent page header) - stylised "C" with a
   highlighted branch in the same family as the ClineMascot. */
export function ClineEmblem({ size = 64, className }: MProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <linearGradient id="ce-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bbb2ff" />
          <stop offset="100%" stopColor="#6a5cff" />
        </linearGradient>
      </defs>
      {/* "C" arc */}
      <path d="M76 36 A30 30 0 1 0 76 64" fill="none" stroke="url(#ce-g)" strokeWidth="6" strokeLinecap="round" />
      {/* highlighted branch node inside the C */}
      <g className="mc-anim-pulse">
        <line x1="22" y1="64" x2="46" y2="56" stroke="#bbb2ff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="46" cy="56" r="5" fill="#bbb2ff" />
        <circle cx="46" cy="56" r="9" fill="none" stroke="#bbb2ff" strokeOpacity="0.5" strokeWidth="1.2" />
      </g>
    </svg>
  );
}

export const MASCOTS: Record<string, (p: MProps) => React.ReactElement> = {
  hermes: HermesMascot,
  claude: ClaudeMascot,
  pi: PiMascot,
  cline: ClineMascot,
  antigravity: AntigravityMascot,
  openclaw: OpenClawMascot,
  jcode: JcodeMascot,
  vibe: VibeMascot,
  codex: CodexMascot,
  sentinel: SentinelMascot,
};
