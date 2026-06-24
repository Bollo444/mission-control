"use client";

import WanderMascots from "./WanderMascots";

/* ------------------------------------------------------------------ *
 * Little Claude sunbursts that wander the hero aimlessly (movement via  *
 * WanderMascots), now and then donning a chef's toque (cooking) or a    *
 * fishbowl space helmet (outer space) — a nod to the Claude FM channel. *
 * ------------------------------------------------------------------ */

const ACCENT = "#e0915f";
type Scene = "none" | "cook" | "space";

function ClaudeGlyph({ size, scene }: { size: number; scene: Scene }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {scene === "space" && (
        // Fishbowl helmet — translucent dome around the glyph.
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: size * 1.55,
            height: size * 1.55,
            transform: "translate(-50%,-50%)",
            borderRadius: "9999px",
            background:
              "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.28), rgba(180,210,255,0.08) 60%, rgba(180,210,255,0.02))",
            boxShadow: "inset 0 0 0 1.5px rgba(190,215,255,0.5)",
          }}
        />
      )}
      {/* The sunburst itself */}
      <span
        className="absolute inset-0 grid place-items-center font-bold"
        style={{ color: ACCENT, fontSize: size, lineHeight: 1, textShadow: `0 0 ${size / 3}px ${ACCENT}66` }}
      >
        ✻
      </span>
      {scene === "cook" && (
        // Chef's toque perched on top.
        <div
          className="absolute left-1/2"
          style={{ top: -size * 0.42, transform: "translateX(-50%)" }}
        >
          <div
            style={{
              width: size * 0.7,
              height: size * 0.32,
              background: "#f3efe6",
              borderRadius: `${size}px ${size}px 3px 3px`,
              boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
            }}
          />
          <div
            style={{
              width: size * 0.5,
              height: size * 0.18,
              margin: "0 auto",
              background: "#e7e1d4",
              borderRadius: "0 0 3px 3px",
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function ClaudeMascots() {
  return (
    <WanderMascots
      count={4}
      sizeRange={[16, 26]}
      scenes={["cook", "space"]}
      renderSprite={({ size, scene }) => (
        <ClaudeGlyph size={size} scene={scene as Scene} />
      )}
    />
  );
}
