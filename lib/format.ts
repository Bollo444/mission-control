// Client-safe formatting helpers (no node imports).

/** Temperature units the user can pick for weather display and speech. */
export type TempUnit = "c" | "f";

/** Convert °C → °F (Open-Meteo reports Celsius). */
export function cToF(c: number): number {
  return (c * 9) / 5 + 32;
}

/** Round a Celsius temperature to the user's preferred unit with its sign. */
export function fmtTemp(c: number, unit: TempUnit): string {
  return `${Math.round(unit === "f" ? cToF(c) : c)}°`;
}

/** Full unit label for speech: "23°C" or "73°F". */
export function fmtTempUnit(c: number, unit: TempUnit): string {
  return `${fmtTemp(c, unit)}${unit.toUpperCase()}`;
}

export function relTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function clockTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Human byte size, e.g. 1.4 GB. */
export function fmtBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Compact uptime, e.g. 3d 4h, 5h 12m, 9m. */
export function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return "0m";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Mission Control status palette (kept in sync with globals.css tokens). */
export const COLORS = {
  ready: "#5cd6a0",
  config: "#f5b75a",
  offline: "#f06a7a",
  ok: "#5cd6a0",
  warn: "#f5b75a",
  crit: "#f06a7a",
  dim: "#7b8294",
  signal: "#46e0d0",
  ink: "#aab1c2",
} as const;

export function stateColor(state: "ready" | "config" | "offline"): string {
  return COLORS[state];
}

/** Green / amber / rose by load percentage (warn ≥70, crit ≥90). */
export function pctColor(pct: number): string {
  if (pct >= 90) return COLORS.crit;
  if (pct >= 70) return COLORS.warn;
  return COLORS.ok;
}
