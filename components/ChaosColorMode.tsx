"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Chaos Color Mode — randomly changes font colors at random intervals
 * A delightful visual glitch effect for when you want the UI to feel alive
 */

const CHAOS_PALETTE = [
  "#f5b75a", // signal gold
  "#00ffff", // cyan
  "#ff00ff", // magenta
  "#39ff14", // neon green
  "#ff3131", // neon red
  "#ff6b00", // neon orange
  "#bc13fe", // electric purple
  "#ffbe0b", // bright amber
  "#fb5607", // vibrant orange-red
  "#8338ec", // deep violet
  "#3a86ff", // bright blue
  "#06ffa5", // mint green
  "#ff006e", // hot pink
  "#ffffff", // pure white
  "#ffd60a", // sun yellow
];

const getRandomColor = () => CHAOS_PALETTE[Math.floor(Math.random() * CHAOS_PALETTE.length)];
const getRandomInterval = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

interface ChaosColorModeProps {
  /** Minimum interval between color changes (ms) */
  minInterval?: number;
  /** Maximum interval between color changes (ms) */
  maxInterval?: number;
  /** CSS selector(s) to target — comma separated */
  selectors?: string;
  /** Whether to enable immediately */
  enabled?: boolean;
  /** Class to apply when active (for toggling) */
  activeClass?: string;
  /** Keyboard code to toggle (e.g., 'KeyC' for C key) */
  toggleKey?: string;
}

export default function ChaosColorMode({
  minInterval = 150,
  maxInterval = 2000,
  selectors = "h1, h2, h3, h4, h5, h6, p, span, a, button, label, .mc-stat-value, [class*='ink']",
  enabled = true,
  activeClass = "chaos-color-active",
  toggleKey = "KeyC",
}: ChaosColorModeProps) {
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originalStylesRef = useRef<Map<Element, string>>(new Map());
  const isEnabledRef = useRef(enabled);
  const [isActive, setIsActive] = useState(enabled);

  // Keep ref in sync with prop
  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  const applyChaosColors = () => {
    if (!isEnabledRef.current) return;

    const elements = document.querySelectorAll(selectors);
    elements.forEach((el) => {
      if (el instanceof HTMLElement) {
        // Store original color if not already stored
        if (!originalStylesRef.current.has(el)) {
          const computed = window.getComputedStyle(el);
          originalStylesRef.current.set(el, computed.color || "");
        }
        // Apply random color
        el.style.color = getRandomColor();
        el.style.transition = `color ${getRandomInterval(50, 300)}ms ease`;
      }
    });

    // Schedule next change at random interval
    const nextInterval = getRandomInterval(minInterval, maxInterval);
    intervalRef.current = setTimeout(applyChaosColors, nextInterval);
  };

  const restoreOriginalColors = () => {
    originalStylesRef.current.forEach((originalColor, el) => {
      if (el instanceof HTMLElement) {
        el.style.color = originalColor;
        el.style.transition = "color 0.3s ease";
      }
    });
  };

  const toggle = () => {
    const newState = !isActive;
    setIsActive(newState);
    isEnabledRef.current = newState;

    if (newState) {
      applyChaosColors();
      document.body.classList.add(activeClass);
    } else {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
        intervalRef.current = null;
      }
      restoreOriginalColors();
      document.body.classList.remove(activeClass);
    }
  };

  // Start/stop on mount/unmount and enabled change
  useEffect(() => {
    if (enabled) {
      applyChaosColors();
      document.body.classList.add(activeClass);
    } else {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      restoreOriginalColors();
      document.body.classList.remove(activeClass);
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
      restoreOriginalColors();
      document.body.classList.remove(activeClass);
    };
  }, [enabled, selectors, minInterval, maxInterval, activeClass]);

  // Expose toggle globally for console access
  useEffect(() => {
    (window as any).__chaosColorToggle = toggle;
    (window as any).__chaosColorEnabled = () => isActive;

    return () => {
      delete (window as any).__chaosColorToggle;
      delete (window as any).__chaosColorEnabled;
    };
  }, [toggle, isActive]);

  // Keyboard shortcut to toggle (default: press 'C' key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === toggleKey) {
        e.preventDefault();
        toggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle, toggleKey]);

  // Visual indicator in corner
  if (isActive) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "12px",
          right: "12px",
          zIndex: 9999,
          background: "rgba(20, 20, 24, 0.9)",
          border: "1px solid #f5b75a",
          borderRadius: "8px",
          padding: "6px 10px",
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "#f5b75a",
          boxShadow: "0 0 20px rgba(245, 183, 90, 0.3)",
          animation: "mc-pulse 1.5s ease-in-out infinite",
          pointerEvents: "none",
        }}
      >
        🎭 CHAOS MODE
      </div>
    );
  }

  // This component renders nothing when inactive — it's purely side-effect driven
  return null;
}

/**
 * Hook version for programmatic control
 */
export function useChaosColors() {
  const [isActive, setIsActive] = useState(false);

  const toggle = () => {
    const toggleFn = (window as any).__chaosColorToggle;
    if (toggleFn) {
      toggleFn();
      setIsActive(!isActive);
    }
  };

  const enable = () => {
    const toggleFn = (window as any).__chaosColorToggle;
    const enabledFn = (window as any).__chaosColorEnabled;
    if (toggleFn && !enabledFn()) {
      toggleFn();
      setIsActive(true);
    }
  };

  const disable = () => {
    const toggleFn = (window as any).__chaosColorToggle;
    const enabledFn = (window as any).__chaosColorEnabled;
    if (toggleFn && enabledFn()) {
      toggleFn();
      setIsActive(false);
    }
  };

  return { isActive, toggle, enable, disable };
}