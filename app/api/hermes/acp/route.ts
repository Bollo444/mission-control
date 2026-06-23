import { NextResponse } from "next/server";
import { acpPrompt, acpAvailable } from "@/lib/acp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Availability probe for the orchestration chat. */
export async function GET() {
  return NextResponse.json({ available: acpAvailable() });
}

/**
 * Orchestration prompt → Hermes (the real agent over ACP). Streams the agent's
 * reply as SSE text chunks: { type:"chunk", text } … then { type:"done" } or
 * { type:"error", message }.
 */
export async function POST(req: Request) {
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* closed */
        }
      };
      try {
        await acpPrompt(message, (text) => send({ type: "chunk", text }));
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
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
