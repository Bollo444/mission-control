"use client";

import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";

/**
 * Theme palette definition
 * Each palette contains:
 * - signal: the global accent color (used for --color-signal, --color-amber, etc.)
 * - agentAccents: per-agent accent color overrides
 * - background: base background (always dark)
 * - surface: surface colors
 * - glow: radial glow color for body background
 */

export interface ThemePalette {
  id: string;
  name: string;
  signal: string;          // Primary accent (replaces --color-signal)
  signalDim: string;       // Dimmed version for selection (replaces --color-signal-dim)
  amber: string;           // Amber variant (replaces --color-amber)
  rose: string;            // Rose variant (replaces --color-rose)
  violet: string;          // Violet variant (replaces --color-violet)
  green: string;           // Green variant (replaces --color-green)
  base: string;            // --color-base (always dark)
  surface: string;         // --color-surface
  surface2: string;        // --color-surface-2
  surface3: string;        // --color-surface-3
  line: string;            // --color-line
  lineSoft: string;        // --color-line-soft
  ink: string;             // --color-ink
  ink2: string;            // --color-ink-2
  ink3: string;            // --color-ink-3
  ink4: string;            // --color-ink-4
  glowRgb: string;         // RGB values for radial glow (e.g., "245, 183, 90")
  agentAccents: Record<string, string>; // Per-agent accent overrides
}

/**
 * Quarter-day themes (rotates every 6 hours)
 * 00:00-05:59 - Night (Mustard Gold)
 * 06:00-11:59 - Morning (Ocean Blue)
 * 12:00-17:59 - Afternoon (Sunset Orange)
 * 18:00-23:59 - Evening (Magenta Violet)
 */

// Base dark colors (shared across all themes)
const DARK_BASE = {
  base: "#0a0a0c",
  surface: "#131214",
  surface2: "#19181b",
  surface3: "#211f23",
  line: "#2c2c30",
  lineSoft: "#1f1e21",
  ink: "#ece3d6",
  ink2: "#c4b3a0",
  ink3: "#8c8276",
  ink4: "#625b53",
};

// Theme 1: Mustard Gold (Night - 00:00-05:59)
const MUSTARD_GOLD: ThemePalette = {
  id: "mustard-gold",
  name: "Mustard Gold",
  signal: "#d4a017",
  signalDim: "#6b520c",
  amber: "#d4a017",
  rose: "#e88d6a",
  violet: "#b894e8",
  green: "#7fc97f",
  glowRgb: "212, 160, 23",
  ...DARK_BASE,
  agentAccents: {
    hermes: "#d4a017",
    claude: "#e8a87c",
    pi: "#7fc97f",
    cline: "#9d8cff",
    antigravity: "#8ab4f8",
    openclaw: "#ff6b5b",
    jcode: "#5fd4c4",
    vibe: "#e88d6a",
    sentinel: "#d65db1",
  },
};

// Theme 2: Ocean Blue (Morning - 06:00-11:59)
const OCEAN_BLUE: ThemePalette = {
  id: "ocean-blue",
  name: "Ocean Blue",
  signal: "#00b4d8",
  signalDim: "#005a6b",
  amber: "#ffb703",
  rose: "#ff6b6b",
  violet: "#a855f7",
  green: "#2ecc71",
  glowRgb: "0, 180, 216",
  ...DARK_BASE,
  agentAccents: {
    hermes: "#ffb703",
    claude: "#e0915f",
    pi: "#2ecc71",
    cline: "#9d8cff",
    antigravity: "#00b4d8",
    openclaw: "#ff6b6b",
    jcode: "#00d4ff",
    vibe: "#ff6b6b",
    sentinel: "#d65db1",
  },
};

// Theme 3: Sunset Orange (Afternoon - 12:00-17:59)
const SUNSET_ORANGE: ThemePalette = {
  id: "sunset-orange",
  name: "Sunset Orange",
  signal: "#ff8c00",
  signalDim: "#7a4300",
  amber: "#ff8c00",
  rose: "#ff5a44",
  violet: "#c084fc",
  green: "#4ade80",
  glowRgb: "255, 140, 0",
  ...DARK_BASE,
  agentAccents: {
    hermes: "#ff8c00",
    claude: "#ff8c00",
    pi: "#4ade80",
    cline: "#9d8cff",
    antigravity: "#60a5fa",
    openclaw: "#ff4444",
    jcode: "#22d3ee",
    vibe: "#f472b6",
    sentinel: "#d65db1",
  },
};

// Theme 4: Magenta Violet (Evening - 18:00-23:59)
const MAGENTA_VIOLET: ThemePalette = {
  id: "magenta-violet",
  name: "Magenta Violet",
  signal: "#d946ef",
  signalDim: "#6b1a6e",
  amber: "#fbbf24",
  rose: "#f43f5e",
  violet: "#d946ef",
  green: "#34d399",
  glowRgb: "217, 70, 239",
  ...DARK_BASE,
  agentAccents: {
    hermes: "#fbbf24",
    claude: "#fb923c",
    pi: "#34d399",
    cline: "#9d8cff",
    antigravity: "#818cf8",
    openclaw: "#f43f5e",
    jcode: "#14b8a6",
    vibe: "#f43f5e",
    sentinel: "#d65db1",
  },
};

// Theme 5: Emerald Green (Bonus - for variety)
const EMERALD_GREEN: ThemePalette = {
  id: "emerald-green",
  name: "Emerald Green",
  signal: "#10b981",
  signalDim: "#045731",
  amber: "#f59e0b",
  rose: "#ec4899",
  violet: "#a855f7",
  green: "#10b981",
  glowRgb: "16, 185, 129",
  ...DARK_BASE,
  agentAccents: {
    hermes: "#f59e0b",
    claude: "#fb923c",
    pi: "#10b981",
    cline: "#9d8cff",
    antigravity: "#60a5fa",
    openclaw: "#ec4899",
    jcode: "#10b981",
    vibe: "#ec4899",
    sentinel: "#d65db1",
  },
};

export const THEME_PALETTES: ThemePalette[] = [
  MUSTARD_GOLD,
  OCEAN_BLUE,
  SUNSET_ORANGE,
  MAGENTA_VIOLET,
  EMERALD_GREEN,
];

/**
 * Get the current theme index based on quarter-day (6-hour blocks)
 * 0 = 00:00-05:59, 1 = 06:00-11:59, 2 = 12:00-17:59, 3 = 18:00-23:59
 */
export function getCurrentThemeIndex(): number {
  if (typeof window === "undefined") return 0;
  const hour = new Date().getHours();
  return Math.floor(hour / 6) % 4; // Only use first 4 for quarter-day rotation
}

/**
 * Get theme for a specific quarter (0-3)
 */
export function getThemeForQuarter(quarter: number): ThemePalette {
  return THEME_PALETTES[quarter % 4];
}

/**
 * Get the current theme based on time of day
 */
export function getCurrentTheme(): ThemePalette {
  return THEME_PALETTES[getCurrentThemeIndex()];
}

/**
 * Apply theme CSS variables to document root
 */
export function applyTheme(theme: ThemePalette): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  
  root.style.setProperty("--color-signal", theme.signal);
  root.style.setProperty("--color-signal-dim", theme.signalDim);
  root.style.setProperty("--color-amber", theme.amber);
  root.style.setProperty("--color-rose", theme.rose);
  root.style.setProperty("--color-violet", theme.violet);
  root.style.setProperty("--color-green", theme.green);
  root.style.setProperty("--color-base", theme.base);
  root.style.setProperty("--color-surface", theme.surface);
  root.style.setProperty("--color-surface-2", theme.surface2);
  root.style.setProperty("--color-surface-3", theme.surface3);
  root.style.setProperty("--color-line", theme.line);
  root.style.setProperty("--color-line-soft", theme.lineSoft);
  root.style.setProperty("--color-ink", theme.ink);
  root.style.setProperty("--color-ink-2", theme.ink2);
  root.style.setProperty("--color-ink-3", theme.ink3);
  root.style.setProperty("--color-ink-4", theme.ink4);
  
  // Update body background glow
  document.body.style.setProperty("--glow-rgb", theme.glowRgb);
}

/**
 * Theme context for React components
 */
interface ThemeContextValue {
  currentTheme: ThemePalette;
  currentThemeIndex: number;
  allThemes: ThemePalette[];
  /** True when the user has pinned a theme (auto-rotation paused). */
  manual: boolean;
  setTheme: (theme: ThemePalette) => void;
  setThemeById: (id: string) => void;
  /** Clear the manual pin and resume quarter-day auto-rotation. */
  setAuto: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const PIN_KEY = "mc-theme-pinned"; // stores the pinned theme id, or absent = auto

function readPin(): ThemePalette | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const id = localStorage.getItem(PIN_KEY);
    return id ? THEME_PALETTES.find((t) => t.id === id) : undefined;
  } catch {
    return undefined;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Resolve the pin synchronously in the initializers so the rotation effect
  // below never sees a stale manual=false on the first commit and clobbers it.
  const [currentTheme, setCurrentTheme] = useState<ThemePalette>(() => {
    if (typeof window === "undefined") return MUSTARD_GOLD;
    return readPin() ?? getCurrentTheme();
  });
  const [currentThemeIndex, setCurrentThemeIndex] = useState(getCurrentThemeIndex());
  const [manual, setManual] = useState(() => Boolean(readPin()));

  // Apply theme on mount and when theme changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  // Auto-rotate on quarter-day boundaries — but ONLY while unpinned. A pinned
  // theme must survive these checks (this is what previously reverted picks).
  useEffect(() => {
    if (manual) return;
    const checkTheme = () => {
      const newIndex = getCurrentThemeIndex();
      setCurrentThemeIndex(newIndex);
      setCurrentTheme(THEME_PALETTES[newIndex]);
    };
    checkTheme();
    const interval = setInterval(checkTheme, 60000);
    return () => clearInterval(interval);
  }, [manual]);

  const setTheme = (theme: ThemePalette) => {
    setManual(true);
    setCurrentTheme(theme);
    setCurrentThemeIndex(THEME_PALETTES.indexOf(theme));
    try {
      localStorage.setItem(PIN_KEY, theme.id);
    } catch {
      /* ignore */
    }
  };

  const setThemeById = (id: string) => {
    const theme = THEME_PALETTES.find(t => t.id === id);
    if (theme) setTheme(theme);
  };

  const setAuto = () => {
    try {
      localStorage.removeItem(PIN_KEY);
    } catch {
      /* ignore */
    }
    setManual(false); // re-enables the rotation effect, which snaps to the clock theme
  };

  const value = useMemo(() => ({
    currentTheme,
    currentThemeIndex,
    allThemes: THEME_PALETTES,
    manual,
    setTheme,
    setThemeById,
    setAuto,
  }), [currentTheme, currentThemeIndex, manual]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

/**
 * Get agent accent color for current theme
 */
export function useAgentAccent(agentId: string): string {
  const { currentTheme } = useTheme();
  return currentTheme.agentAccents[agentId] ?? currentTheme.signal;
}

/**
 * Hook to get theme-aware agent accent (for non-React contexts or SSR)
 */
export function getAgentAccentForTheme(agentId: string, theme?: ThemePalette): string {
  const t = theme ?? getCurrentTheme();
  return t.agentAccents[agentId] ?? t.signal;
}

export { THEME_PALETTES as default };