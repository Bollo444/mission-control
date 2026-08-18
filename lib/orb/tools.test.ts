import { describe, expect, test, vi, afterEach } from "vitest";
import { fetchWeatherBrief } from "./tools";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("orb weather tool", () => {
  test("returns a human-readable brief on a healthy Open-Meteo response", async () => {
    const body = {
      current: {
        temperature_2m: 21.4,
        apparent_temperature: 20.1,
        relative_humidity_2m: 55,
        wind_speed_10m: 8.2,
        weather_code: 2,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const r = await fetchWeatherBrief(40.7, -74.0);
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/21/);
    expect(r.text).toMatch(/partly cloudy/);
    expect(r.text).toMatch(/55/);
  });

  test("maps a storm code to its description", async () => {
    const body = {
      current: {
        temperature_2m: 30,
        apparent_temperature: 31,
        relative_humidity_2m: 90,
        wind_speed_10m: 40,
        weather_code: 95,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const r = await fetchWeatherBrief();
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/thunderstorm/);
  });

  test("never throws — returns ok:false on a failed lookup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const r = await fetchWeatherBrief(0, 0);
    expect(r.ok).toBe(false);
    expect(typeof r.text).toBe("string");
  });

  test("never throws — returns ok:false on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const r = await fetchWeatherBrief(0, 0);
    expect(r.ok).toBe(false);
    expect(typeof r.text).toBe("string");
  });
});
