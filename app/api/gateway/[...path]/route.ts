import { cascadeChat, gatewayModels } from "@/lib/gateway";
import { getGatewayToken } from "@/lib/settings";
import { recordTokens } from "@/lib/usage";
import { logEvent } from "@/lib/logbook";
import { responsesToChat, parseChat, buildResponsesSSE } from "@/lib/responses-bridge";
import { forwardChat, omnirouteModels } from "@/lib/omniroute";

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
  if (sub !== "chat/completions" && sub !== "responses") {
    return Response.json({ error: `Unsupported path: ${sub}` }, { status: 404 });
  }

  const agentId = req.headers.get("x-mc-agent") || undefined;
  const sessionId = req.headers.get("x-mc-session") || undefined;

  // OpenAI Responses API (Codex). Translate to chat, cascade, emit a synthetic
  // Responses SSE stream the Codex client accepts.
  // responses path: bypass OmniRoute, cascadeChat handles the Codex bridge.
  if (sub === "responses") {
    const rbody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const chatBody = responsesToChat(rbody);
    const r = await cascadeChat(chatBody, { agentId, sessionId });
    if (!r.ok) {
      return Response.json({ error: { message: r.error, type: "upstream_error" } }, { status: r.status });
    }
    const json = (await r.response.json().catch(() => ({}))) as Record<string, unknown>;
    const { text, toolCalls, usage } = parseChat(json);
    if (typeof usage.total_tokens === "number") recordTokens(r.served.provider, usage.total_tokens);
    const sse = buildResponsesSSE({ model: String(rbody.model ?? "auto"), text, toolCalls, usage });
    return new Response(sse, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-MC-Served-By": `${r.served.provider}/${r.served.model}`,
      },
    });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // 1. Probe + Forward to OmniRoute (Fleet Gateway)
  let result: any = null;
  let response: Response | null = await forwardChat(body, req.headers);
  let isFailover = false;

  if (response) {
    result = { ok: true, response, served: { provider: "omniroute", model: String(body.model ?? "auto") }, attempts: 1 };
  } else {
    // 2. Fall back to cascadeChat (Backup Generator)
    isFailover = true;
    result = await cascadeChat(body, { agentId, sessionId });
    if (isFailover) {
      logEvent({
        source: "gateway",
        level: "warn",
        event: "failover engaged",
        detail: `OmniRoute unreachable — Backup Generator served ${result.ok ? `${result.served.provider}/${result.served.model}` : "error"}`
      });
    }
  }

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  const u = result.response;
  const headers: Record<string, string> = {
    "Content-Type": u.headers.get("content-type") || "application/json",
    "X-MC-Served-By": result.served.provider === "omniroute"
      ? "omniroute"
      : `backup/${result.served.provider}/${result.served.model}`,
    "X-MC-Attempts": String(result.attempts),
  };
  if (isFailover) {
    headers["X-MC-Failover"] = "1";
  }
  // Non-streaming: capture token usage for the budget gauges, then pass through.
  if (body.stream !== true) {
    const text = await u.text();
    try {
      const tok = (JSON.parse(text) as { usage?: { total_tokens?: number } }).usage?.total_tokens;
      if (typeof tok === "number") recordTokens(result.served.provider, tok);
    } catch {
      /* not JSON */
    }
    return new Response(text, { status: u.status, headers });
  }
  // Streaming: pass through transparently while scanning the tail for token usage.
  if (u.body) {
    const provider = result.served.provider;
    let buf = "";
    const dec = new TextDecoder();
    const ts = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        try {
          buf += dec.decode(chunk, { stream: true });
        } catch {
          /* binary */
        }
        if (buf.length > 8000) buf = buf.slice(-8000);
        ctrl.enqueue(chunk);
      },
      flush() {
        const mm = buf.match(/"total_tokens"\s*:\s*(\d+)/g);
        if (mm && mm.length) {
          const n = mm[mm.length - 1].match(/(\d+)/);
          if (n) recordTokens(provider, parseInt(n[1], 10));
        }
      },
    });
    return new Response(u.body.pipeThrough(ts), { status: u.status, headers });
  }
  return new Response(u.body, { status: u.status, headers });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const sub = subPath(path);
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized — use your Mission Control gateway token as the API key." }, { status: 401 });
  }
  if (sub === "models") {
    const backupModels = gatewayModels().map((m) => ({ id: m.id, object: "model", owned_by: m.owned_by }));
    const primaryModels = await omnirouteModels();

    // Merge, favoring primary but keeping backup as standby visible
    const all = [
      ...primaryModels.map(m => ({ ...m, object: "model" })),
      ...backupModels.filter(b => !primaryModels.some(p => p.id === b.id))
    ];

    return Response.json({
      object: "list",
      data: all,
    });
  }
  return Response.json({ error: `Unsupported path: ${sub}` }, { status: 404 });
}
