"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* ------------------------------------------------------------------ *
 * Reusable "little creatures wandering the hero" engine. Handles the   *
 * aimless pacing: position, velocity, edge-bounce, random course       *
 * changes, a bob, facing-flip, and optional scene rotation. The caller  *
 * supplies the sprite via renderSprite({size, scene}).                  *
 *                                                                       *
 * Perf: the rAF loop mutates a ref and writes transforms straight to    *
 * the DOM nodes — NO React state per frame. React only re-renders on    *
 * the rare scene change (every few seconds). Reduced-motion users get   *
 * a calm static scatter.                                                *
 * ------------------------------------------------------------------ */

interface Mob {
  x: number; // 0..1 of width
  y: number; // 0..1 of height
  vx: number;
  vy: number;
  size: number;
  scene: string;
  sceneUntil: number;
  bob: number;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function seedMob(lo: number, hi: number): Mob {
  return {
    x: rand(0.08, 0.92),
    y: rand(0.45, 0.9),
    vx: rand(-0.05, 0.05) || 0.03,
    vy: rand(-0.012, 0.012),
    size: rand(lo, hi),
    scene: "none",
    sceneUntil: 0,
    bob: rand(0, Math.PI * 2),
  };
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
  const [reduced, setReduced] = useState(false);
  // Seeded once; sizes are fixed, scenes drive the rare re-render.
  const mobsRef = useRef<Mob[]>([]);
  if (mobsRef.current.length !== count) {
    mobsRef.current = Array.from({ length: count }, () => seedMob(sizeRange[0], sizeRange[1]));
  }
  const nodes = useRef<(HTMLDivElement | null)[]>([]);
  const [render, setRender] = useState(0); // bumped only when a scene flips
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const writeNode = (i: number, m: Mob, motion: boolean) => {
    const el = nodes.current[i];
    if (!el) return;
    el.style.left = `${m.x * 100}%`;
    el.style.top = `${m.y * 100}%`;
    el.style.transform = `translate(-50%,-50%) translateY(${motion ? Math.sin(m.bob) * 2 : 0}px) scaleX(${m.vx < 0 ? -1 : 1})`;
  };

  // Position the static scatter immediately (also the reduced-motion layout).
  useEffect(() => {
    mobsRef.current.forEach((m, i) => writeNode(i, m, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, render]);

  // Wander loop — DOM writes only; setState solely on scene change.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const mobs = mobsRef.current;
      let sceneFlipped = false;
      for (let i = 0; i < mobs.length; i++) {
        const m = mobs[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.x < 0.04) { m.x = 0.04; m.vx = Math.abs(m.vx); }
        if (m.x > 0.96) { m.x = 0.96; m.vx = -Math.abs(m.vx); }
        if (m.y < 0.42) { m.y = 0.42; m.vy = Math.abs(m.vy); }
        if (m.y > 0.92) { m.y = 0.92; m.vy = -Math.abs(m.vy); }
        if (Math.random() < 0.004) m.vx = rand(-0.05, 0.05) || 0.03;
        if (Math.random() < 0.004) m.vy = rand(-0.012, 0.012);
        const pool = scenesRef.current;
        if (pool.length && now > m.sceneUntil) {
          if (m.scene !== "none") {
            m.scene = "none";
            m.sceneUntil = now + rand(4000, 9000);
            sceneFlipped = true;
          } else if (Math.random() < 0.02) {
            m.scene = pool[Math.floor(Math.random() * pool.length)];
            m.sceneUntil = now + rand(2500, 5000);
            sceneFlipped = true;
          }
        }
        m.bob += dt * 6;
        writeNode(i, m, true);
      }
      if (sceneFlipped) setRender((v) => v + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {mobsRef.current.map((m, i) => (
        <div
          key={i}
          ref={(el) => { nodes.current[i] = el; }}
          className="absolute"
          style={{ willChange: "transform", left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
        >
          {renderSprite({ size: m.size, scene: m.scene })}
        </div>
      ))}
    </div>
  );
}
