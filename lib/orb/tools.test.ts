import { describe, expect, test, vi, afterEach } from "vitest";
import { fetchWeatherBrief, geocodeZip, geocodePlaceName } from "./tools";

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

  test("geocodes a zip and names the place in the brief", async () => {
    const zipBody = {
      "post code": "10075",
      places: [{ "place name": "New York City", state: "New York", latitude: "40.773", longitude: "-73.9566" }],
    };
    const wxBody = {
      current: { temperature_2m: 22, apparent_temperature: 21, relative_humidity_2m: 50, wind_speed_10m: 10, weather_code: 0 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("zippopotam")) {
          return new Response(JSON.stringify(zipBody), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify(wxBody), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const r = await fetchWeatherBrief(undefined, undefined, "10075");
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/New York City/);
    expect(r.text).toMatch(/10075/);
    expect(r.text).toMatch(/22/);
  });

  test("converts temperatures to Fahrenheit when the user picks °F", async () => {
    const wxBody = {
      current: { temperature_2m: 23, apparent_temperature: 27, relative_humidity_2m: 50, wind_speed_10m: 10, weather_code: 0 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(wxBody), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const r = await fetchWeatherBrief(40.7, -74, undefined, undefined, "f");
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/73°F/);
    expect(r.text).toMatch(/feels like 81°F/);
    // And the default stays Celsius.
    const rc = await fetchWeatherBrief(40.7, -74, undefined, undefined, "c");
    expect(rc.text).toMatch(/23°C/);
  });

  test("uses provided coordinates without geocoding", async () => {
    const wxBody = {
      current: { temperature_2m: 30, apparent_temperature: 31, relative_humidity_2m: 90, wind_speed_10m: 40, weather_code: 95 },
    };
    let geocodeCalled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("zippopotam")) {
          geocodeCalled = true;
          return new Response("{}", { status: 404 });
        }
        return new Response(JSON.stringify(wxBody), { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    const r = await fetchWeatherBrief(40.7, -74, "10075");
    expect(geocodeCalled).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.text).toMatch(/thunderstorm/);
  });
});

describe("orb geocoding", () => {
  test("geocodeZip rejects a malformed zip without a fetch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect(await geocodeZip("not-a-zip")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  test("geocodeZip returns null on a failed lookup", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    expect(await geocodeZip("10075")).toBeNull();
  });

  test("geocodeZip resolves a zip to coordinates + label", async () => {
    const body = {
      places: [{ "place name": "New York City", state: "New York", latitude: "40.773", longitude: "-73.9566" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const g = await geocodeZip("10075");
    expect(g).not.toBeNull();
    expect(g?.lat).toBe(40.773);
    expect(g?.lon).toBe(-73.9566);
    expect(g?.label).toMatch(/New York City/);
  });

  test("geocodePlaceName resolves a city name", async () => {
    const body = {
      results: [{ name: "Austin", admin1: "Texas", country: "United States", latitude: 30.2672, longitude: -97.7431 }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const g = await geocodePlaceName("Austin, TX");
    expect(g).not.toBeNull();
    expect(g?.label).toMatch(/Austin/);
    expect(g?.lat).toBe(30.2672);
  });

  test("geocodePlaceName returns null when nothing matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } })),
    );
    expect(await geocodePlaceName("atlantis-under-the-sea-xyz")).toBeNull();
  });
});
