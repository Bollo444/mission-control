import { NextResponse } from "next/server";
import {
  routeTurn,
  GROQ_TIERS,
  MAX_REFLECTION_TURNS,
} from "@/lib/orb/router";
import { streamGroq } from "@/lib/orb/groq";
import { fetchWeatherBrief } from "@/lib/orb/tools";
import {
  bootstrapMemoryVault,
  primeHermesContext,
  appendDailyNote,
  memoryPrimeEnabled,
  dailyNoteEnabled,
} from "@/lib/orb/memory-prime";
import { ensureVault } from "@/lib/memory";
import { acpPrompt, acpAvailable } from "@/lib/acp";
import { readSettings } from "@/lib/settings";
import { recordAttempt, usageReport } from "@/lib/usage";
import type { OrbTurnRequest, OrbTurnEvent } from "@/lib/orb/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily Groq request cap for the orb's cost guard (env-overridable). */
const DAILY_CAP = Number(process.env.ORB_GROQ_DAILY_CAP || 1000);

function groqKey(): string {
  return readSettings().apiKeys.GROQ_API_KEY || process.env.GROQ_API_KEY || "";
}

/** Fraction (0..1) of the day's Groq budget already consumed. */
function budgetRatio(): number {
  const row = usageReport(["groq"])[0];
  const reqDay = row?.reqDay ?? 0;
  return Math.min(1, reqDay / (DAILY_CAP > 0 ? DAILY_CAP : 1000));
}

/** True when a Groq error is terminal (auth / access / model / quota) — a
 *  reflective retry can't fix these, so the circuit-breaker falls back to
 *  Hermes at once instead of burning a doomed retry. */
function isGroqTerminalError(e: { message: string }): boolean {
  return (
    /^Groq (401|403|404|429)/i.test(e.message) ||
    /rate limit|invalid api key|does not exist|terms acceptance|quota/i.test(e.message)
  );
}

/** Human-readable badge reason for a Groq outage (no raw JSON). */
function friendlyGroqReason(e: { message: string }): string {
  if (/^Groq 429/i.test(e.message) || /rate limit/i.test(e.message)) {
    return "Groq rate limit reached (429) — try again shortly; answered via Hermes.";
  }
  if (/^Groq 401/i.test(e.message) || /invalid api key/i.test(e.message)) {
    return "Groq key rejected (401) — check the key in Settings; answered via Hermes.";
  }
  if (/^Groq 404/i.test(e.message) || /does not exist/i.test(e.message)) {
    return "Groq model unavailable (404) — check the model; answered via Hermes.";
  }
  const firstLine = e.message.split("\n")[0].trim();
  return `Groq unavailable (${firstLine.slice(0, 120)}) — answered via Hermes.`;
}

/** Availability probe for the orb (UI disables the orb gracefully without a key). */
export async function GET() {
  const key = groqKey();
  return NextResponse.json({
    available: Boolean(key),
    acpAvailable: acpAvailable(),
    tiers: GROQ_TIERS,
    dailyCap: DAILY_CAP,
    budgetRatio: budgetRatio(),
    memoryPrime: memoryPrimeEnabled(),
    dailyNote: dailyNoteEnabled(),
  });
}

/**
 * One orb turn. The intelligent router classifies the message and picks the
 * Groq fast or capable model; conversational turns stream the reply token by
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

      const key = groqKey();
      const history = body.history ?? [];

      // Tool layer: if the router flagged a live-data ask (weather), run the
      // deterministic weather tool and inject the result into whatever backend
      // answers — Groq system context or the Hermes prompt — so the orb can
      // answer from real data even with no model-side tool calling.
      const weatherNote = decision.signals.intents.includes("weather")
        ? (await fetchWeatherBrief(body.lat, body.lon)).text
        : null;
      // Memory-vault layer: seed the vault files once and read the priming
      // block every Hermes turn boots with (boot config + index + yesterday's
      // daily note + active priorities), so Hermes answers as the same
      // colleague every turn instead of a stranger. Read-only on the
      // control-plane side — Hermes is never handed arbitrary file access here.
      if (memoryPrimeEnabled() || dailyNoteEnabled()) {
        ensureVault();
        bootstrapMemoryVault();
      }
      const primed = primeHermesContext();
      const hermPrompt = (msg: string) =>
        [weatherNote, primed, msg]
          .filter(Boolean)
          .join(
            `\n\n`,
          );
      const checkpoint = () => {
        try {
          appendDailyNote({ prompt: message });
        } catch {
          /* best-effort — never fail a turn over a note write */
        }
      };

      // No Groq key → the orb stays Hermes-powered end to end.
      if (!key) {
        send({
          type: "route",
          tier: "hermes",
          model: "hermes-acp",
          reason: "No Groq API key configured — answering via Hermes.",
          complexity: decision.signals.complexity,
        });
        try {
          await acpPrompt(hermPrompt(message), (text) => send({ type: "chunk", text }));
          checkpoint();
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
          await acpPrompt(hermPrompt(message), (text) => send({ type: "chunk", text }));
          checkpoint();
          send({ type: "done", tier: decision.tier, model: decision.model });
        } catch (e) {
          send({ type: "error", message: (e as Error).message });
        } finally {
          controller.close();
        }
        return;
      }

      // Conversational turn → stream directly from the selected Groq model,
      // with a reflective circuit-breaker: on failure, retry once with the
      // error text injected into context, hard-capped at MAX_REFLECTION_TURNS.
      send({
        type: "route",
        tier: decision.tier,
        model: decision.model,
        reason: decision.reason,
        complexity: decision.signals.complexity,
      });

      const t0 = Date.now();
      let attempt = 0;
      let lastError: { message: string } = { message: "" };
      try {
        for (;;) {
          attempt++;
          try {
            const retryNote =
              attempt > 1
                ? "A previous attempt failed. Fix the problem and answer correctly this time. " +
                  "Last error: " + lastError.message
                : "";
            const system = [weatherNote && `Live weather: ${weatherNote}`, retryNote]
              .filter(Boolean)
              .join("\n") || undefined;
            for await (const text of streamGroq({
              model: decision.model,
              messages: [...history, { role: "user", content: message }],
              apiKey: key,
              maxOutputTokens: 1024,
              system,
            })) {
              send({ type: "chunk", text });
            }
            recordAttempt("groq", { ok: true, latencyMs: Date.now() - t0 });
            send({ type: "done", tier: decision.tier, model: decision.model });
            break;
          } catch (e) {
            lastError = e as Error;
            // Auth/model/quota failures are terminal — skip the reflective retry
            // and fall back to Hermes at once so the orb answers promptly.
            if (isGroqTerminalError(lastError) || attempt >= MAX_REFLECTION_TURNS) {
              recordAttempt("groq", { ok: false, latencyMs: Date.now() - t0 });
              // Groq is down (key rejected / model gone / rate limit). Fall
              // back to Hermes so the orb still answers; surface why in the badge.
              send({
                type: "route",
                tier: "hermes",
                model: "hermes-acp",
                reason: friendlyGroqReason(lastError),
                complexity: decision.signals.complexity,
              });
              try {
                await acpPrompt(hermPrompt(message), (text) => send({ type: "chunk", text }));
                checkpoint();
                send({ type: "done", tier: "hermes", model: "hermes-acp" });
              } catch (e2) {
                send({ type: "error", message: (e2 as Error).message });
              }
              break;
            }
            // Reflective retry — inject the error and loop.
          }
        }
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
