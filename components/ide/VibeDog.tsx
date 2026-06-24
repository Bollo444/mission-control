"use client";

import WanderMascots from "./WanderMascots";

/* ------------------------------------------------------------------ *
 * Vibe's loyal dog — wanders the hero with the same aimless pacing as  *
 * the Claude mascots (shared WanderMascots engine), persistent and     *
 * always on the Vibe page. A simple side-profile pup in Vibe's accent. *
 * ------------------------------------------------------------------ */

const ACCENT = "#f06a7a";

function DogGlyph({ size }: { size: number }) {
  const w = size * 1.8;
  const h = size * 1.25;
  return (
    // Side profile facing right; the engine flips horizontally to face travel.
    <svg width={w} height={h} viewBox="0 0 46 32" aria-hidden>
      <g fill={ACCENT}>
        {/* tail, curling up at the back */}
        <path d="M6 16 q-5 -2 -3 -8 q4 1 6 6 z" />
        {/* body */}
        <ellipse cx="21" cy="17" rx="14" ry="7.5" />
        {/* legs */}
        <rect x="12" y="22" width="3.4" height="8" rx="1.5" />
        <rect x="18" y="22" width="3.4" height="8" rx="1.5" />
        <rect x="26" y="22" width="3.4" height="8" rx="1.5" />
        <rect x="31" y="22" width="3.4" height="8" rx="1.5" />
        {/* head */}
        <circle cx="35" cy="13" r="6.5" />
        {/* snout */}
        <rect x="38" y="12" width="7" height="4.5" rx="2.2" />
        {/* floppy ear */}
        <path d="M33 7 q-4 -7 -8 -2 q3 5 8 5 z" />
      </g>
      {/* eye + nose */}
      <circle cx="36.5" cy="12" r="1" fill="#1b1b1e" />
      <circle cx="44.5" cy="13.6" r="1.2" fill="#1b1b1e" />
    </svg>
  );
}

export default function VibeDog() {
  return (
    <WanderMascots
      count={2}
      sizeRange={[18, 26]}
      renderSprite={({ size }) => <DogGlyph size={size} />}
    />
  );
}
