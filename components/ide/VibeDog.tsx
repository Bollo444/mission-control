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
        {/* waggy tail — sticks up at the back and swishes side to side */}
        <g style={{ transformOrigin: "9px 14px", animation: "mc-wag 0.55s ease-in-out infinite" }}>
          <path d="M9 14 q-7 -1 -6 -8 q5 2 8 7 z" />
        </g>
        {/* body */}
        <ellipse cx="21" cy="17" rx="14" ry="7.5" />
        {/* legs */}
        <rect x="12" y="22" width="3.4" height="8" rx="1.5" />
        <rect x="18" y="22" width="3.4" height="8" rx="1.5" />
        <rect x="26" y="22" width="3.4" height="8" rx="1.5" />
        <rect x="31" y="22" width="3.4" height="8" rx="1.5" />
        {/* head */}
        <circle cx="35" cy="13" r="6.5" />
        {/* rounded dog muzzle */}
        <ellipse cx="41" cy="14.5" rx="4.5" ry="3.2" />
        {/* floppy ear — droops down behind the head */}
        <path d="M33 8 q-3 0 -3.5 6 q-0.3 4 3 4.5 q2.2 0.2 2.5 -3.5 q0.3 -6 -2 -7 z" />
      </g>
      {/* eye + nose */}
      <circle cx="36.5" cy="12" r="1" fill="#1b1b1e" />
      <ellipse cx="44.6" cy="14" rx="1.5" ry="1.3" fill="#1b1b1e" />
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
