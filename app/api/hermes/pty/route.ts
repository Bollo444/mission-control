import { NextResponse } from "next/server";
import {
  getOrCreateSession,
  subscribe,
  writeToSession,
  resizeSession,
  killSession,
  sessionInfo,
} from "@/lib/pty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Native-TUI bridge. The browser's xterm.js talks to a real server-side PTY:
 *   GET  ?session=ID&kind=hermes&cols=&rows=  → SSE stream of terminal output
 *   POST { session, type: "input"|"resize"|"kill", data?, cols?, rows? }
 * The PTY lives in the Node process, so the terminal survives tab switches —
 * reconnecting the stream replays scrollback and resumes the live session.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const session = url.searchParams.get("session") || "hermes-main";
  const kind = url.searchParams.get("kind") || "hermes";
  const cols = parseInt(url.searchParams.get("cols") || "80", 10);
  const rows = parseInt(url.searchParams.get("rows") || "24", 10);

  const created = getOrCreateSession(session, kind, { cols, rows });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* closed */
        }
      };

      if (!created.ok) {
        send({ type: "error", message: created.error });
        send({ type: "exit" });
        controller.close();
        return;
      }

      const unsub = subscribe(session, (chunk) => send({ type: "data", data: chunk }));
      if (!unsub) {
        send({ type: "error", message: "session unavailable" });
        controller.close();
        return;
      }
      send({ type: "ready" });

      // Heartbeat keeps the SSE connection from idling out behind proxies.
      const beat = setInterval(() => send({ type: "ping" }), 20_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(beat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
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

export async function POST(req: Request) {
  let body: {
    session?: string;
    type?: string;
    data?: string;
    cols?: number;
    rows?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const session = body.session || "hermes-main";

  switch (body.type) {
    case "input":
      return NextResponse.json({ ok: writeToSession(session, body.data ?? "") });
    case "resize":
      return NextResponse.json({
        ok: resizeSession(session, body.cols ?? 0, body.rows ?? 0),
      });
    case "kill":
      return NextResponse.json({ ok: killSession(session) });
    case "info":
      return NextResponse.json({ ok: true, info: sessionInfo(session) });
    default:
      return NextResponse.json({ ok: false, error: "unknown type" }, { status: 400 });
  }
}
