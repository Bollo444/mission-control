"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtTemp, hexA, type TempUnit } from "@/lib/format";

/* Right-side weather — a cluster of independently floating glass chips
 * (today's conditions + one chip per day for the 5-day strip: 2 before,
 * today, 2 after) from Open-Meteo (free, no API key). No enclosing box —
 * each chip floats on its own translucent glass, gently drifting as a
 * constellation. Collapses to a single small chip showing today.
 *
 * Location: resolved saved-override → browser geolocation → default NYC.
 * Browser geolocation can be blocked (403 / permission) — a 📍 chip lets the
 * user set a US zip code instead, geocoded via Zippopotam (free, no key) and
 * persisted. The same saved location is what the orb's weather tool reads, so
 * the panel and the orb never disagree about where the user is. */

const GOLD = "#f5b75a";

const WMO: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "🌤️", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️", 56: "🌧️", 57: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️", 66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 77: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "🌧️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};
const wmo = (c: number) => WMO[c] ?? "🌡️";

const LOC_KEY = "mc.weather.loc";
const UNITS_KEY = "mc.weather.units"; // "c" | "f" — the user's pick
const DEFAULT_LOC = { lat: 40.7128, lon: -74.006 }; // fallback: NYC

interface SavedLoc {
  lat: number;
  lon: number;
  zip?: string;
  label?: string;
}

interface DayRow {
  date: string;
  code: number;
  tmax: number;
  tmin: number;
}
interface WeatherData {
  current: { temp: number; code: number; humidity: number; wind: number; feels: number };
  days: DayRow[];
}

function dayLabel(dateStr: string, todayStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const t = new Date(todayStr + "T12:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === -1) return "Y-1";
  if (diff === 1) return "D+1";
  return diff < 0 ? `Y${diff}` : `D+${diff}`;
}

/* One floating glass chip — translucent, softly shadowed, faint hairline. */
function chip(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "rgba(10,10,14,0.5)",
    backdropFilter: "blur(14px)",
    boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.14)}, 0 10px 30px -12px rgba(0,0,0,0.7)`,
    ...extra,
  };
}

export default function WeatherPanel({ space, immersive }: { space: number; immersive: boolean }) {
  const [loc, setLoc] = useState<SavedLoc | null>(null);
  const [data, setData] = useState<WeatherData | null>(null);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");
  // Temperature unit — user picks; same choice feeds the orb's spoken answers.
  const [units, setUnits] = useState<TempUnit>("c");
  // Location manager — set a zip code when geolocation is blocked.
  const [editing, setEditing] = useState(false);
  const [zipDraft, setZipDraft] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [zipError, setZipError] = useState("");

  // Restore + persist the temperature unit choice.
  useEffect(() => {
    try {
      if (localStorage.getItem(UNITS_KEY) === "f") setUnits("f");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(UNITS_KEY, units);
    } catch {
      /* ignore */
    }
  }, [units]);

  // Resolve location: saved override → geolocation → default.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOC_KEY);
      if (saved) {
        setLoc(JSON.parse(saved) as SavedLoc);
        return;
      }
    } catch {
      /* ignore */
    }
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const l = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          setLoc(l);
          try {
            localStorage.setItem(LOC_KEY, JSON.stringify(l));
          } catch {
            /* ignore */
          }
        },
        () => setLoc(DEFAULT_LOC),
        { timeout: 6000 },
      );
    } else {
      setLoc(DEFAULT_LOC);
    }
  }, []);

  const load = useCallback(async (lat: number, lon: number) => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&timezone=auto&past_days=2&forecast_days=3`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      const days: DayRow[] = (j.daily?.time ?? []).map((date: string, i: number) => ({
        date,
        code: j.daily.weather_code[i],
        tmax: Math.round(j.daily.temperature_2m_max[i]),
        tmin: Math.round(j.daily.temperature_2m_min[i]),
      }));
      setData({
        current: {
          temp: Math.round(j.current.temperature_2m),
          code: j.current.weather_code,
          humidity: Math.round(j.current.relative_humidity_2m),
          wind: Math.round(j.current.wind_speed_10m),
          feels: Math.round(j.current.apparent_temperature),
        },
        days,
      });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!loc) return;
    void load(loc.lat, loc.lon);
    const t = setInterval(() => void load(loc.lat, loc.lon), 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [loc, load]);

  // The orb can change the location too ("set my location to 10075") — apply
  // its saved location live so the panel reflects it without a reload.
  useEffect(() => {
    const onLoc = (e: Event) => {
      const l = (e as CustomEvent<SavedLoc>).detail;
      if (l && typeof l.lat === "number" && typeof l.lon === "number") setLoc(l);
    };
    window.addEventListener("mc:loc", onLoc);
    return () => window.removeEventListener("mc:loc", onLoc);
  }, []);

  // Save a zip code as the weather location (geocoded server-side, persisted,
  // live). Same /api/orb/geocode route the orb's LOCATION: marker uses, so the
  // panel and the orb resolve places identically.
  const saveZip = useCallback(async () => {
    const z = zipDraft.trim();
    if (!/^\d{5}$/.test(z)) {
      setZipError("Enter a 5-digit US zip code");
      return;
    }
    setZipBusy(true);
    setZipError("");
    try {
      const res = await fetch("/api/orb/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: z }),
      });
      const j = (await res.json()) as { ok?: boolean; loc?: SavedLoc; error?: string };
      if (!res.ok || !j?.ok || !j?.loc) {
        setZipError(j?.error ?? `Couldn't find zip ${z}`);
        return;
      }
      const g = j.loc;
      setLoc(g);
      try {
        localStorage.setItem(LOC_KEY, JSON.stringify(g));
      } catch {
        /* ignore */
      }
      setEditing(false);
      setZipDraft("");
    } catch {
      setZipError("Location service unreachable — try again");
    } finally {
      setZipBusy(false);
    }
  }, [zipDraft]);

  const todayStr = data?.days.find((d) => dayLabel(d.date, d.date) === "Today")?.date
    ?? new Date().toISOString().slice(0, 10);

  // Yield to the orb: no room → hidden; tight stage → collapsed to the single
  // today chip (not expandable — expanding would collide again); wide stage →
  // the full floating constellation. Gone entirely during immersive mode.
  const noRoom = space > 0 && space < 720;
  const compact = space > 0 && space < 1150;
  if (immersive || noRoom) return null;

  const locName = loc?.label || (loc?.zip ? `zip ${loc.zip}` : "");
  const locLine = locName ? `📍 ${locName}${loc?.zip && loc.label ? ` · ${loc.zip}` : ""}` : "📍 Set location";

  return (
    <div className="pointer-events-auto absolute right-5 top-1/2 z-30 flex -translate-y-1/2 flex-col items-end gap-2.5">
      {/* Six floating islands - each chip carries its own @keyframes + duration + delay
          so they never visibly sync up. The column reads as six independent
          drifts, not one block bouncing in step. */}
      <div className="flex flex-col items-end gap-1.5">
        {compact ? (
          <div
            title="Weather"
            aria-label="Weather"
            className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
            style={chip()}
          >
            {data ? wmo(data.current.code) : error ? "⚠" : "☁"}
          </div>
        ) : open && data ? (
          <>
            {/* Location — set / change the zip the weather is for. */}
            <div className="flex items-center gap-1.5" style={chip({ padding: "4px 10px" })}>
              {editing ? (
                <>
                  <input
                    value={zipDraft}
                    onChange={(e) => setZipDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void saveZip()}
                    placeholder="10075"
                    aria-label="Zip code"
                    autoFocus
                    className="w-16 rounded-md px-1.5 py-0.5 text-[10px] outline-none"
                    style={{ background: "rgba(8,8,12,0.7)", color: "var(--color-ink)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}` }}
                  />
                  <button
                    onClick={() => void saveZip()}
                    disabled={zipBusy}
                    title="Set location"
                    aria-label="Set location"
                    className="rounded-md px-2 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                    style={{ background: hexA(GOLD, 0.16), color: GOLD, boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}` }}
                  >
                    {zipBusy ? "…" : "Set"}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setZipError(""); }}
                    title="Cancel"
                    aria-label="Cancel"
                    className="rounded-md px-1.5 py-0.5 text-[10px] text-[var(--color-ink-4)] hover:text-[var(--color-ink)]"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  title="Set your location — weather is shown for this place"
                  className="max-w-[180px] truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ color: hexA(GOLD, 0.9) }}
                >
                  {locLine}
                </button>
              )}
              <span className="mx-0.5 h-3 w-px" style={{ background: hexA(GOLD, 0.25) }} />
              {/* °C / °F — the user's temperature-unit pick. */}
              <div className="flex items-center gap-0.5 rounded-md px-0.5 py-0.5" style={{ background: "rgba(8,8,12,0.6)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.25)}` }}>
                {(["c", "f"] as TempUnit[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => setUnits(u)}
                    title={`Show temperatures in ${u === "c" ? "Celsius" : "Fahrenheit"}`}
                    aria-label={u === "c" ? "Celsius" : "Fahrenheit"}
                    className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                    style={
                      units === u
                        ? { background: hexA(GOLD, 0.2), color: GOLD }
                        : { color: "var(--color-ink-4)" }
                    }
                  >
                    °{u.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {zipError && (
              <div className="rounded-md px-2 py-0.5 text-[10px]" style={{ color: "#ff9d9d", background: "rgba(8,8,12,0.7)" }}>
                {zipError}
              </div>
            )}

            {/* Today — the large floating island, slow vertical bob */}
            <div
              className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
              style={chip({
                animation: "mc-island-1 6.4s ease-in-out infinite",
                animationDelay: "0s",
                transformOrigin: "center",
                willChange: "transform",
              })}
            >
              <span className="text-3xl leading-none">{wmo(data.current.code)}</span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold leading-none tabular-nums">{fmtTemp(data.current.temp, units)}</span>
                  <span className="text-[10px] text-[var(--color-ink-3)]">feels {fmtTemp(data.current.feels, units)}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--color-ink-3)]">
                  💧 {data.current.humidity}% · 🍃 {data.current.wind} km/h
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                title="Collapse weather"
                aria-label="Collapse weather"
                className="grid h-5 w-5 place-items-center rounded text-[10px] text-[var(--color-ink-4)] hover:bg-white/10 hover:text-[var(--color-ink)]"
              >
                ▸
              </button>
            </div>

            {/* The 5-day strip — stacked vertically, each day an independent
                floating glass island with its own @keyframes + duration +
                delay so no two share a motion. */}
            <div className="flex flex-col items-end gap-1.5">
              {data.days.map((d, i) => {
                const isToday = dayLabel(d.date, todayStr) === "Today";
                const kf = ["mc-island-2","mc-island-3","mc-island-4","mc-island-5","mc-island-6"][i % 5];
                const dur = ["7.2s","5.8s","8.4s","6.9s","7.5s"][i % 5];
                const del = ["-0.4s","-1.1s","-2.3s","-3.5s","-1.7s"][i % 5];
                return (
                  <div
                    key={d.date}
                    className="flex w-11 flex-col items-center gap-0.5 rounded-xl px-1 py-2"
                    style={chip(
                      isToday
                        ? {
                            background: hexA(GOLD, 0.14),
                            boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.35)}, 0 10px 30px -12px rgba(0,0,0,0.7)`,
                            animation: `${kf} ${dur} ease-in-out infinite`,
                            animationDelay: del,
                            transformOrigin: "center",
                            willChange: "transform",
                          }
                        : {
                            animation: `${kf} ${dur} ease-in-out infinite`,
                            animationDelay: del,
                            transformOrigin: "center",
                            willChange: "transform",
                          },
                    )}
                  >
                    <span className="text-[8px] uppercase tracking-wider" style={{ color: isToday ? GOLD : "var(--color-ink-4)" }}>
                      {dayLabel(d.date, todayStr)}
                    </span>
                    <span className="text-base leading-none">{wmo(d.code)}</span>
                    <span className="text-[9px] tabular-nums" style={{ color: "var(--color-ink-2)" }}>
                      {fmtTemp(d.tmax, units)} <span style={{ color: "var(--color-ink-4)" }}>{fmtTemp(d.tmin, units)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <button
            onClick={() => setOpen(true)}
            title="Expand weather"
            aria-label="Expand weather"
            className="grid h-14 w-14 place-items-center rounded-2xl text-2xl"
            style={chip()}
          >
            {data ? wmo(data.current.code) : error ? "⚠" : "☁"}
          </button>
        )}
      </div>
    </div>
  );
}
