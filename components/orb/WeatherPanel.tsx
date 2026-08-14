"use client";

import { useCallback, useEffect, useState } from "react";
import { hexA } from "@/lib/format";

/* Right-side weather — a cluster of independently floating glass chips
 * (today's conditions + one chip per day for the 5-day strip: 2 before,
 * today, 2 after) from Open-Meteo (free, no API key). No enclosing box —
 * each chip floats on its own translucent glass, gently drifting as a
 * constellation. Collapses to a single small chip showing today. */

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
const DEFAULT_LOC = { lat: 40.7128, lon: -74.006 }; // fallback: NYC

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

export default function WeatherPanel() {
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null);
  const [data, setData] = useState<WeatherData | null>(null);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState("");

  // Resolve location: saved override → geolocation → default.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOC_KEY);
      if (saved) {
        setLoc(JSON.parse(saved));
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

  const todayStr = data?.days.find((d) => dayLabel(d.date, d.date) === "Today")?.date
    ?? new Date().toISOString().slice(0, 10);

  return (
    <div className="pointer-events-auto absolute right-5 top-1/2 z-30 flex -translate-y-1/2 flex-col items-end gap-2.5">
      {/* inner wrapper carries the drift so it never fights the centering translate */}
      <div style={{ animation: "mc-weather-drift 7s ease-in-out infinite" }} className="flex flex-col items-end gap-2.5">
        {open && data ? (
          <>
            {/* Today — the big floating chip */}
            <div
              className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
              style={chip({ animationDelay: "0.2s" })}
            >
              <span className="text-3xl leading-none">{wmo(data.current.code)}</span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl font-semibold leading-none tabular-nums">{data.current.temp}°</span>
                  <span className="text-[10px] text-[var(--color-ink-3)]">feels {data.current.feels}°</span>
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

            {/* The 5-day strip — each day floats as its own chip */}
            <div className="flex gap-2">
              {data.days.map((d) => {
                const isToday = dayLabel(d.date, todayStr) === "Today";
                return (
                  <div
                    key={d.date}
                    className="flex w-11 flex-col items-center gap-0.5 rounded-xl px-1 py-2"
                    style={chip(
                      isToday
                        ? { background: hexA(GOLD, 0.14), boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.35)}, 0 10px 30px -12px rgba(0,0,0,0.7)` }
                        : undefined,
                    )}
                  >
                    <span className="text-[8px] uppercase tracking-wider" style={{ color: isToday ? GOLD : "var(--color-ink-4)" }}>
                      {dayLabel(d.date, todayStr)}
                    </span>
                    <span className="text-base leading-none">{wmo(d.code)}</span>
                    <span className="text-[9px] tabular-nums" style={{ color: "var(--color-ink-2)" }}>
                      {d.tmax}° <span style={{ color: "var(--color-ink-4)" }}>{d.tmin}°</span>
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
