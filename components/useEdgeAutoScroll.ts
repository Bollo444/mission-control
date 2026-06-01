"use client";

import { useEffect, useRef } from "react";

/**
 * Auto-scrolls a scrollable element based on how close the cursor is to its top
 * or bottom edge. Performance-minded: the rect is read once per enter (no
 * per-move layout reads), velocity lives in a closure (no React re-renders), and
 * the rAF loop only runs while the pointer is inside.
 */
export function useEdgeAutoScroll<T extends HTMLElement>(zone = 72, maxSpeed = 13) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let vy = 0;
    let rect: DOMRect | null = null;

    const tick = () => {
      if (vy !== 0 && el.scrollHeight > el.clientHeight) el.scrollTop += vy;
      raf = requestAnimationFrame(tick);
    };
    const onEnter = () => {
      rect = el.getBoundingClientRect();
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: MouseEvent) => {
      if (!rect) rect = el.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y < zone) vy = -maxSpeed * (1 - Math.max(0, y) / zone);
      else if (y > rect.height - zone) vy = maxSpeed * (1 - Math.max(0, rect.height - y) / zone);
      else vy = 0;
    };
    const onLeave = () => {
      vy = 0;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      rect = null;
    };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [zone, maxSpeed]);

  return ref;
}
