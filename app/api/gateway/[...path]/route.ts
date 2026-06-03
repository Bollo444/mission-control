import { cascadeChat, gatewayModels } from "@/lib/gateway";
import { getGatewayToken } from "@/lib/settings";
import { logEvent } from "@/lib/logbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Fleet Gateway — one OpenAI-compatible endpoint in front of every configured
  free provider, with cross-provider cascade on rate-limit/error.

  Use it: point an OpenAI-compatible client's base URL at
    http://127.0.0.1:4317/api/gateway/v1
  with the Mission Control gateway token (Settings) as the API key. Optionally
  send `X-MC-Agent: <agentId>` to route by that agent's preferred model, or use
  model "auto" to let the fleet pick.
*/

function subPath(path: string[] | undefined): string {
  return (path ?? []).join("/").replace(/^v1\//, "");
}

function authorized(req: Request): boolean {
  const provided = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(provided) && provided === getGatewayToken();
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sub = subPath(path);

  if (!authorized(req)) {
    logEvent({ source: "gateway", level: "warn", event: "unauthorized request", detail: sub });
    return Response.json(
      { error: "Unauthorized — use your Mission Control gateway token (Settings) as the API key." },
      { status: 401 }
    );
  }
  if (sub !== "chat/completions") {
    return Response.json({ error: `Unsupported path: ${sub}` }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const agentId = req.headers.get("x-mc-agent") || undefined;
  const result = await cascadeChat(body, { agentId });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  const u = result.response;
  return new Response(u.body, {
    status: u.status,
    headers: {
      "Content-Type": u.headers.get("content-type") || "application/json",
      "X-MC-Served-By": `${result.served.provider}/${result.served.model}`,
      "X-MC-Attempts": String(result.attempts),
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sub = subPath(path);
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized — use your Mission Control gateway token as the API key." }, { status: 401 });
  }
  if (sub === "models") {
    return Response.json({
      object: "list",
      data: gatewayModels().map((m) => ({ id: m.id, object: "model", owned_by: m.owned_by })),
    });
  }
  return Response.json({ error: `Unsupported path: ${sub}` }, { status: 404 });
}
