/**
 * orb/tools.ts
 *
 * The orb's tool layer — a tiny, deterministic set of live-data tools the turn
 * route can invoke before a prompt goes to a model. The result is injected as
 * plain context, so it works no matter which backend answers (Gemini or the
 * Hermes fallback) and costs zero model tokens to "call".
 *
 * Currently: weather via Open-Meteo (free, no key) — the same live source the
 * home-stage weather panel uses, so the orb and the panel never disagree.
 */

/** WMO weather-code → short English description. */
const WMO: Record<number, string> = {
  0: "clear",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "foggy",
  48: "icy fog",
  51: "light drizzle",
  53: "drizzle",
  55: "heavy drizzle",
  56: "freezing drizzle",
  57: "heavy freezing drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  66: "freezing rain",
  67: "heavy freezing rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light showers",
  81: "showers",
  82: "heavy showers",
  85: "light snow showers",
  86: "heavy snow showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "severe thunderstorm with hail",
};

export interface ToolResult {
  ok: boolean;
  /** Human-readable, model-ready summary of what the tool found. */
  text: string;
}

/** Fallback coordinates when the client hasn't shared its location yet. */
const DEFAULT_LOC = { lat: 40.7128, lon: -74.006 };

/**
 * Fetch a live weather brief from Open-Meteo (free, no API key). Returns a
 * one-line summary suitable for injecting into a prompt; never throws.
 */
export async function fetchWeatherBrief(lat?: number, lon?: number): Promise<ToolResult> {
  const loc = {
    lat: typeof lat === "number" ? lat : DEFAULT_LOC.lat,
    lon: typeof lon === "number" ? lon : DEFAULT_LOC.lon,
  };
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { ok: false, text: "weather lookup failed" };
    const j = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
      };
    };
    const c = j.current;
    if (!c || typeof c.temperature_2m !== "number") return { ok: false, text: "weather lookup returned no data" };
    const r = (x: number) => Math.round(x);
    const desc = WMO[c.weather_code ?? -1] ?? "unknown conditions";
    return {
      ok: true,
      text:
        `Live weather right now: ${r(c.temperature_2m)}°C (feels like ${r(c.apparent_temperature ?? c.temperature_2m)}°C), ` +
        `${desc}, humidity ${r(c.relative_humidity_2m ?? 0)}%, wind ${r(c.wind_speed_10m ?? 0)} km/h.`,
    };
  } catch {
    return { ok: false, text: "weather lookup unavailable" };
  }
}
