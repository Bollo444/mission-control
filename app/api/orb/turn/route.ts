import { NextResponse } from "next/server";
import { routeTurn, GEMINI_TIERS } from "@/lib/orb/router";
import { streamGemini } from "@/lib/orb/gemini";
import { acpPrompt, acpAvailable } from "@/lib/acp";
import { readSettings } from "@/lib/settings";
import { recordAttempt, usageReport } from "@/lib/usage";
import type { OrbTurnRequest, OrbTurnEvent } from "@/lib/orb/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily Gemini request cap for the orb's cost guard (env-overridable). */
const DAILY_CAP = Number(process.env.ORB_GEMINI_DAILY_CAP || 1000);

function geminiKey(): string {
  return readSettings().apiKeys.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
}

/** Fraction (0..1) of the day's Gemini budget already consumed. */
function budgetRatio(): number {
  const row = usageReport(["google"])[0];
  const reqDay = row?.reqDay ?? 0;
  return Math.min(1, reqDay / (DAILY_CAP > 0 ? DAILY_CAP : 1000));
}

/** Availability probe for the orb (UI disables the orb gracefully without a key). */
export async function GET() {
  const key = geminiKey();
  return NextResponse.json({
    available: Boolean(key),
    acpAvailable: acpAvailable(),
    tiers: GEMINI_TIERS,
    dailyCap: DAILY_CAP,
    budgetRatio: budgetRatio(),
  });
}

/**
 * One orb turn. The intelligent router classifies the message and picks the
 * Gemini 2.0 or 3.0 backend; conversational turns stream the reply token by
 * token, while agentic turns delegate to Hermes (tools / task execution).
 * Streams SSE: {type:"route"} → {type:"chunk"}* → {type:"done"} | {type:"error"}.
 */
export async function POST(req: Request) {
  let body: OrbTurnRequest;
  try {
    body = (await req.json()) as OrbTurnRequest;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: OrbTurnEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          /* client closed */
        }
      };

      const decision = routeTurn(message, {
        preferFast: body.preferFast,
        preferSmart: body.preferSmart,
        budgetRatio: budgetRatio(),
        contextHint: body.contextHint,
        history: body.history,
      });

      const key = geminiKey();
      const history = body.history ?? [];

      // No Gemini key → the orb stays Hermes-powered end to end.
      if (!key) {
        send({
          type: "route",
          tier: "hermes",
          model: "hermes-acp",
          reason: "No Gemini API key configured — answering via Hermes.",
          complexity: decision.signals.complexity,
        });
        try {
          await acpPrompt(message, (text) => send({ type: "chunk", text }));
          send({ type: "done", tier: "hermes", model: "hermes-acp" });
        } catch (e) {
          send({ type: "error", message: (e as Error).message });
        } finally {
          controller.close();
        }
        return;
      }

      // Agentic turn → Hermes executes the task; the chosen tier is reported so
      // the UI still shows the routing decision.
      if (decision.delegate === "hermes") {
        send({
          type: "route",
          tier: decision.tier,
          model: decision.model,
          reason: decision.reason,
          complexity: decision.signals.complexity,
        });
        try {
          await acpPrompt(message, (text) => send({ type: "chunk", text }));
          send({ type: "done", tier: decision.tier, model: decision.model });
        } catch (e) {
          send({ type: "error", message: (e as Error).message });
        } finally {
          controller.close();
        }
        return;
      }

      // Conversational turn → stream directly from the selected Gemini tier.
      send({
        type: "route",
        tier: decision.tier,
        model: decision.model,
        reason: decision.reason,
        complexity: decision.signals.complexity,
      });

      const t0 = Date.now();
      try {
        for await (const text of streamGemini({
          model: decision.model,
          messages: [...history, { role: "user", content: message }],
          apiKey: key,
          maxOutputTokens: 1024,
        })) {
          send({ type: "chunk", text });
        }
        recordAttempt("google", { ok: true, latencyMs: Date.now() - t0 });
        send({ type: "done", tier: decision.tier, model: decision.model });
      } catch (e) {
        recordAttempt("google", { ok: false, latencyMs: Date.now() - t0 });
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
