import { readSettings, PROVIDERS } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  OpenRouter free-model cascade proxy.

  OpenRouter's free pool is heavily rate-limited (lots of users hammer it), and
  its native `models` fallback array is capped at 3. This OpenAI-compatible
  endpoint tries your requested model, then cascades through EVERY OpenRouter
  free model in the catalog — in chunks of 3 (each chunk uses OpenRouter's own
  fallback) — and returns the first response that isn't rate-limited.

  Point any agent/tool's OpenRouter base URL at:
    http://127.0.0.1:4317/api/route/openrouter/v1
  then call /chat/completions as usual. The key is read from Mission Control's
  settings (~/.mission-control), so the caller doesn't need it.
*/

const OR_BASE = "https://openrouter.ai/api/v1";

function freeOpenRouterModels(): string[] {
  const p = PROVIDERS.find((x) => x.id === "openrouter");
  return (p?.models ?? []).filter((m) => m.endsWith(":free"));
}

function apiKey(): string | null {
  const s = readSettings();
  return s.apiKeys.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY || null;
}

function orHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://127.0.0.1:4317",
    "X-Title": "Mission Control",
  };
}

function passthrough(upstream: Response, extra?: Record<string, string>): Response {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      ...(extra ?? {}),
    },
  });
}

/** Strip an optional leading "v1/" so the base URL may or may not include /v1. */
function subPath(path: string[] | undefined): string {
  return (path ?? []).join("/").replace(/^v1\//, "");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const sub = subPath(path);
  const key = apiKey();
  if (!key) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not set in Mission Control settings." },
      { status: 400 }
    );
  }
  const headers = orHeaders(key);

  // Only chat/completions gets the cascade; everything else passes straight through.
  if (sub !== "chat/completions") {
    const upstream = await fetch(`${OR_BASE}/${sub}`, {
      method: "POST",
      headers,
      body: await req.text(),
    });
    return passthrough(upstream);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown> & {
    model?: string;
  };
  const free = freeOpenRouterModels();
  const primary = typeof body.model === "string" && body.model ? body.model : free[0];
  // requested model first, then every other free model
  const ordered = [primary, ...free.filter((m) => m !== primary)].filter(Boolean) as string[];

  const base = { ...body };
  delete base.model; // OpenRouter uses `models` (the fallback array) instead

  let last: { status: number; text: string } | null = null;
  // chunk by 3 — OpenRouter's `models` array (native fallback) caps at 3 items
  for (let i = 0; i < ordered.length; i += 3) {
    const chunk = ordered.slice(i, i + 3);
    let upstream: Response;
    try {
      upstream = await fetch(`${OR_BASE}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...base, models: chunk }),
      });
    } catch {
      last = { status: 0, text: "network error" };
      continue;
    }
    if (upstream.ok) {
      // Tell the caller how deep the cascade went (0 = primary set served).
      return passthrough(upstream, { "X-MC-OR-Fallback-Set": String(i / 3) });
    }
    last = { status: upstream.status, text: (await upstream.text()).slice(0, 200) };
    // 4xx that aren't rate/availability (e.g. 400 bad request) won't improve by
    // trying another model — stop early.
    if (upstream.status === 400 || upstream.status === 401) break;
  }

  return Response.json(
    {
      error:
        "All OpenRouter free models are rate-limited or unavailable right now — retry shortly.",
      triedModels: ordered.length,
      lastUpstream: last,
    },
    { status: 503 }
  );
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const sub = subPath(path);
  const key = apiKey();
  if (!key) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not set in Mission Control settings." },
      { status: 400 }
    );
  }
  const upstream = await fetch(`${OR_BASE}/${sub}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return passthrough(upstream);
}
