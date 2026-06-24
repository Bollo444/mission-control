"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * Little Claude sunbursts that wander the hero aimlessly — pacing,     *
 * bobbing, flipping to face their direction, and now and then donning  *
 * a chef's toque (cooking) or a fishbowl space helmet (outer space),   *
 * a nod to the Claude FM channel. Pure client whimsy; reduced-motion   *
 * users get a calm, static scatter instead.                            *
 * ------------------------------------------------------------------ */

const ACCENT = "#e0915f";
type Scene = "none" | "cook" | "space";

interface Mob {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  vx: number;
  vy: number;
  size: number;
  scene: Scene;
  sceneUntil: number; // ms timestamp
  bob: number; // phase
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

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
  const hostRef = useRef<HTMLDivElement>(null);
  const [mobs, setMobs] = useState<Mob[]>([]);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Seed the little crowd once.
  useEffect(() => {
    const n = 4;
    const seed: Mob[] = Array.from({ length: n }, () => ({
      x: rand(0.08, 0.92),
      y: rand(0.45, 0.9),
      vx: rand(-0.05, 0.05) || 0.03,
      vy: rand(-0.012, 0.012),
      size: rand(16, 26),
      scene: "none" as Scene,
      sceneUntil: 0,
      bob: rand(0, Math.PI * 2),
    }));
    setMobs(seed);
  }, []);

  // Wander loop.
  useEffect(() => {
    if (reduced || mobs.length === 0) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      setMobs((prev) =>
        prev.map((m) => {
          let { x, y, vx, vy, scene, sceneUntil } = m;
          x += vx * dt;
          y += vy * dt;
          // Bounce off the padded edges, facing the new direction.
          if (x < 0.04) { x = 0.04; vx = Math.abs(vx); }
          if (x > 0.96) { x = 0.96; vx = -Math.abs(vx); }
          if (y < 0.42) { y = 0.42; vy = Math.abs(vy); }
          if (y > 0.92) { y = 0.92; vy = -Math.abs(vy); }
          // Occasional aimless course change.
          if (Math.random() < 0.004) vx = rand(-0.05, 0.05) || 0.03;
          if (Math.random() < 0.004) vy = rand(-0.012, 0.012);
          // Occasionally strike a scene (cook / space), then drop it.
          if (now > sceneUntil) {
            if (scene !== "none") {
              scene = "none";
              sceneUntil = now + rand(4000, 9000);
            } else if (Math.random() < 0.02) {
              scene = Math.random() < 0.5 ? "cook" : "space";
              sceneUntil = now + rand(2500, 5000);
            }
          }
          return { ...m, x, y, vx, vy, scene, sceneUntil, bob: m.bob + dt * 6 };
        })
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, mobs.length]);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {mobs.map((m, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${m.x * 100}%`,
            top: `${m.y * 100}%`,
            transform: `translate(-50%,-50%) translateY(${reduced ? 0 : Math.sin(m.bob) * 2}px) scaleX(${m.vx < 0 ? -1 : 1})`,
            transition: reduced ? "none" : "transform 0.1s linear",
          }}
        >
          <ClaudeGlyph size={m.size} scene={m.scene} />
        </div>
      ))}
    </div>
  );
}
