"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * Reusable "little creatures wandering the hero" engine. Handles the   *
 * aimless pacing: position, velocity, edge-bounce, random course       *
 * changes, a bob, facing-flip, and optional scene rotation. The caller  *
 * supplies the sprite via renderSprite({size, scene}). Reduced-motion   *
 * users get a calm static scatter.                                      *
 * ------------------------------------------------------------------ */

interface Mob {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  vx: number;
  vy: number;
  size: number;
  scene: string; // "none" or one of the caller's scenes
  sceneUntil: number;
  bob: number;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export default function WanderMascots({
  count = 4,
  sizeRange = [16, 26],
  scenes = [],
  renderSprite,
}: {
  count?: number;
  sizeRange?: [number, number];
  /** Optional scene names randomly struck then dropped (e.g. ["cook","space"]). */
  scenes?: string[];
  renderSprite: (args: { size: number; scene: string }) => ReactNode;
}) {
  const [mobs, setMobs] = useState<Mob[]>([]);
  const [reduced, setReduced] = useState(false);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Seed the crowd once.
  useEffect(() => {
    const [lo, hi] = sizeRange;
    setMobs(
      Array.from({ length: count }, () => ({
        x: rand(0.08, 0.92),
        y: rand(0.45, 0.9),
        vx: rand(-0.05, 0.05) || 0.03,
        vy: rand(-0.012, 0.012),
        size: rand(lo, hi),
        scene: "none",
        sceneUntil: 0,
        bob: rand(0, Math.PI * 2),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

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
          if (x < 0.04) { x = 0.04; vx = Math.abs(vx); }
          if (x > 0.96) { x = 0.96; vx = -Math.abs(vx); }
          if (y < 0.42) { y = 0.42; vy = Math.abs(vy); }
          if (y > 0.92) { y = 0.92; vy = -Math.abs(vy); }
          if (Math.random() < 0.004) vx = rand(-0.05, 0.05) || 0.03;
          if (Math.random() < 0.004) vy = rand(-0.012, 0.012);
          const pool = scenesRef.current;
          if (pool.length && now > sceneUntil) {
            if (scene !== "none") {
              scene = "none";
              sceneUntil = now + rand(4000, 9000);
            } else if (Math.random() < 0.02) {
              scene = pool[Math.floor(Math.random() * pool.length)];
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
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
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
          {renderSprite({ size: m.size, scene: m.scene })}
        </div>
      ))}
    </div>
  );
}
