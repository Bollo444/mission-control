import { NextRequest, NextResponse } from "next/server";
  import { anthropicToOpenAI, openAIToAnthropic, parseSlot, makeAnthropicError } from "@/lib/anthropic-bridge";
  import { cascadeChat } from "@/lib/gateway";
  import { readSettings } from "@/lib/settings";
  import { PROVIDERS, displayName } from "@/lib/settings";
  import { recordTokens } from "@/lib/usage";
  import { logEvent } from "@/lib/logbook";

  export const runtime = "nodejs";
  export const dynamic = "force-dynamic";

  const AGENT_ID = "anthropic-bridge";

  function authorized(req: Request): boolean {
    const authHeader = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
    const apiKeyHeader = req.headers.get("x-api-key") ?? null;
    const settings = readSettings();
    const token = settings.gatewayToken ?? "";
    return (
      (!!authHeader && authHeader === token) ||
      (!!apiKeyHeader && apiKeyHeader === token)
    );
  }

  async function handle(req: NextRequest, pathSegments: string[]): Promise<Response> {
    if (!authorized(req)) {
      return NextResponse.json(makeAnthropicError(401, "invalid api key").body, { status: 401 });
    }

    const joined = (pathSegments ?? []).join("/");
    const last = (pathSegments ?? []).at(-1) ?? "";

    try {
      // GET /v1/models  -- derive from the catalog exported by lib/settings
      if (req.method === "GET" && last === "models") {
        const seen = new Set<string>();
        const out = {
          object: "list",
          data: PROVIDERS.flatMap((p) => p.models)
            .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
            .map((id) => ({
              id,
              object: "model",
              type: "model",
              display_name: displayName(id),
            })),
        };
        return NextResponse.json(out);
      }

      // POST /v1/messages  -- main chat path
      if (req.method === "POST" && (joined === "v1/messages" || last === "messages")) {
        const anthropicBody = await req.json().catch(() => null);
        if (!anthropicBody || typeof anthropicBody !== "object") {
          return NextResponse.json(makeAnthropicError(400, "invalid json body").body, { status: 400 });
        }
        const requestedModel: string = String(anthropicBody.model ?? "");
        if (!requestedModel) {
          return NextResponse.json(makeAnthropicError(400, "model is required").body, { status: 400 });
        }

        // Resolve slot -> upstream via settings.anthropicSlots[slot] when possible.
        // Explicit provider/model requests (e.g. "opencode/x-preview-f-free") pass
        // through untouched — parseSlot() would otherwise map them to the sonnet
        // slot and silently swap the model the caller asked for.
        let upstreamModel = requestedModel;
        const slot = parseSlot(requestedModel);
        if (!/^[a-z0-9_-]+\/.+/i.test(requestedModel)) {
          const settings = readSettings();
          const rule = settings.anthropicSlots?.[slot];
          if (rule?.model) upstreamModel = rule.model;
        }

        const openaiBody = anthropicToOpenAI({ ...anthropicBody, model: upstreamModel });

        const result = await cascadeChat(openaiBody, { agentId: AGENT_ID });

        if (!result.ok) {
          try {
            logEvent({
              source: AGENT_ID,
              level: "error",
              event: "messages.error",
              detail: `${result.status ?? 502} ${result.error}`,
              meta: { model: requestedModel, attempts: result.attempts },
            });
          } catch {}
          const status = result.status && result.status >= 400 ? result.status : 502;
          return NextResponse.json(makeAnthropicError(status, result.error).body, { status });
        }

        // CascadeOk -- parse upstream OpenAI response, re-translate to Anthropic
        const upstream = await result.response.json().catch(() => null);
        if (!upstream || typeof upstream !== "object") {
          return NextResponse.json(makeAnthropicError(502, "upstream returned non-json").body, { status: 502 });
        }

        const promptTokens = Number((upstream as any)?.usage?.prompt_tokens ?? 0);
        const completionTokens = Number((upstream as any)?.usage?.completion_tokens ?? 0);
        const totalTokens = promptTokens + completionTokens;
        const servedProvider = result.served?.provider ?? "unknown";
        try {
          if (totalTokens > 0) recordTokens(servedProvider, totalTokens);
          await new Promise<void>((resolve) => {
            try {
              logEvent({
                source: AGENT_ID,
                level: "info",
                event: "messages.success",
                detail: `${requestedModel} -> ${servedProvider}/${result.served?.model ?? "?"}`,
                meta: { attempts: result.attempts, promptTokens, completionTokens },
              });
              resolve();
            } catch {
              resolve();
            }
          });
        } catch {}

        const anthropicResp = openAIToAnthropic(upstream as any, requestedModel);
        return NextResponse.json(anthropicResp);
      }

      return NextResponse.json(makeAnthropicError(404, `not found: ${req.method} /${joined}`).body, { status: 404 });
    } catch (err: any) {
      const status = Number(err?.status) || 500;
      const message = String(err?.message ?? "internal error");
      try {
        logEvent({ source: AGENT_ID, level: "error", event: "messages.error", detail: `${status} ${message}` });
      } catch {}
      return NextResponse.json(makeAnthropicError(status, message).body, { status });
    }
  }

  export const GET = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
    ctx.params.then(({ path }) => handle(req, path));

  export const POST = (req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
    ctx.params.then(({ path }) => handle(req, path));