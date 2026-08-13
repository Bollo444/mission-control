import { cascadeChat, gatewayModels } from "@/lib/gateway";
import { getGatewayToken, readSettings } from "@/lib/settings";
import { recordTokens } from "@/lib/usage";
import { logEvent } from "@/lib/logbook";
import { responsesToChat, parseChat, buildResponsesSSE } from "@/lib/responses-bridge";
import { anthropicToOpenAI, openAIToAnthropic, streamAdapter, makeAnthropicError, parseSlot } from "@/lib/anthropic-bridge";
import { forwardChat, omnirouteModels } from "@/lib/omniroute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
  Backup Generator — one OpenAI-compatible endpoint in front of every configured
  free provider, with cross-provider cascade on rate-limit/error. The Power
  Plant (OmniRoute at :20128) is the primary inference path; this endpoint tries
  the Power Plant first and only falls back to its own cascade when the Power
  Plant is unreachable or rate-limited.

  Use it: point an OpenAI-compatible client's base URL at
    http://127.0.0.1:4317/api/gateway/v1
  (Claude Code: http://127.0.0.1:4317/api/gateway + /v1/messages)
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
  if (sub !== "chat/completions" && sub !== "responses" && sub !== "messages") {
    return Response.json({ error: `Unsupported path: ${sub}` }, { status: 404 });
  }

  const agentId = req.headers.get("x-mc-agent") || undefined;
  const sessionId = req.headers.get("x-mc-session") || undefined;

  // OpenAI Responses API (Codex). Translate to chat, cascade, emit a synthetic
  // Responses SSE stream the Codex client accepts.
  // responses path: bypass the Power Plant, cascadeChat handles the Codex bridge.
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

  if (sub === "messages") {
    // Anthropic Messages API (Claude Code). Translate to chat via the existing
    // anthropic-bridge, try the Power Plant (OmniRoute) first, fall back to the
    // Backup Generator cascade, then translate back with true SSE streaming.
    const mbody = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const requestedModel = String(mbody.model ?? "auto");
    // Resolve Claude slots (haiku/sonnet/opus) to the configured upstream model
    // from Settings — same semantics as the legacy /api/anthropic slot bridge,
    // so the sonnet/opus/haiku slot defaults actually take effect here.
    const settings = readSettings();
    const slotRule = settings.anthropicSlots?.[parseSlot(requestedModel)];
    const upstreamModel = slotRule?.model ?? requestedModel;
    const wantsStream = mbody.stream !== false;
    const chatBody = anthropicToOpenAI({ ...mbody, model: upstreamModel, stream: wantsStream ? true : false });

    const ppRes = await forwardChat(chatBody, req.headers);
    if (ppRes && ppRes.ok) {
      // Served by the Power Plant (OmniRoute).
      if (wantsStream) {
        return new Response(streamAdapter(ppRes.body ?? new ReadableStream(), requestedModel), {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "anthropic-version": "2023-06-01",
            "X-MC-Served-By": "omniroute",
          },
        });
      }
      const json = (await ppRes.json().catch(() => ({}))) as Record<string, unknown>;
      const usage = json.usage as { total_tokens?: number } | undefined;
      if (typeof usage?.total_tokens === "number") recordTokens("omniroute", usage.total_tokens);
      return Response.json(openAIToAnthropic(json, requestedModel), {
        status: 200,
        headers: { "anthropic-version": "2023-06-01", "X-MC-Served-By": "omniroute" },
      });
    }

    // Power Plant unreachable, rate-limited, or rejected the request (e.g.
    // bare "auto" can 400 on OmniRoute's chat path) → Backup Generator cascade.
    if (ppRes && !ppRes.ok) {
      logEvent({
        source: "gateway",
        level: "warn",
        event: "power plant rejected (messages)",
        detail: `HTTP ${ppRes.status} — falling back to Backup Generator`,
      });
    }
    const r = await cascadeChat(chatBody, { agentId, sessionId });
    if (!r.ok) {
      const err = makeAnthropicError(r.status >= 400 ? r.status : 502, r.error);
      return Response.json(err.body, { status: err.status });
    }
    logEvent({
      source: "gateway",
      level: "warn",
      event: "failover engaged (messages)",
      detail: `Power Plant unreachable — Backup Generator served ${r.served.provider}/${r.served.model}`,
    });
    const servedBy = `backup/${r.served.provider}/${r.served.model}`;
    if (wantsStream) {
      return new Response(streamAdapter(r.response.body ?? new ReadableStream(), requestedModel), {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "anthropic-version": "2023-06-01",
          "X-MC-Served-By": servedBy,
        },
      });
    }
    const json = (await r.response.json().catch(() => ({}))) as Record<string, unknown>;
    const usage = json.usage as { total_tokens?: number } | undefined;
    if (typeof usage?.total_tokens === "number") recordTokens(r.served.provider, usage.total_tokens);
    return Response.json(openAIToAnthropic(json, requestedModel), {
      status: 200,
      headers: { "anthropic-version": "2023-06-01", "X-MC-Served-By": servedBy },
    });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // 1. Probe + Forward to the Power Plant (OmniRoute)
  let result: any = null;
  let response: Response | null = await forwardChat(body, req.headers);
  let isFailover = false;

  if (response && response.ok) {
    result = { ok: true, response, served: { provider: "omniroute", model: String(body.model ?? "auto") }, attempts: 1 };
  } else {
    // 2. Fall back to cascadeChat (Backup Generator). Also fails over when the
    // Power Plant answers but rejects the request (e.g. its "auto" combo can
    // 400/429 on chat/completions) — the caller's request is not the bug.
    if (response && !response.ok) {
      logEvent({
        source: "gateway",
        level: "warn",
        event: "power plant rejected",
        detail: `HTTP ${response.status} — failing over to Backup Generator`,
      });
    }
    isFailover = true;
    result = await cascadeChat(body, { agentId, sessionId });
    // Only log "failover engaged" when the Backup Generator actually served.
    // (Previously this fired even when cascadeChat returned ok:false, producing
    // a misleading "served error" line.)
    if (result.ok) {
      logEvent({
        source: "gateway",
        level: "warn",
        event: "failover engaged",
        detail: `Power Plant unreachable — Backup Generator served ${result.served.provider}/${result.served.model}`
      });
    } else {
      logEvent({
        source: "gateway",
        level: "error",
        event: "failover failed",
        detail: `Power Plant unreachable AND Backup Generator failed: ${result.error ?? "unknown"}`
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
