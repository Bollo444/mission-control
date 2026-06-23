import { getSystemReport } from "@/lib/system";
import { streamMeeting } from "@/lib/meeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint for live-LLM meeting upgrades. The client renders the templated
 * meeting from GET /api/meeting instantly, then opens this stream to patch each
 * turn's text as its model reply lands. First event is `meta` (the full
 * templated meeting, so a client can also bootstrap from here); subsequent
 * events are `turn` patches: { kind:"turn", index, id, text }.
 */
export async function GET(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* controller already closed */
        }
      };
      let aborted = false;
      req.signal.addEventListener("abort", () => {
        aborted = true;
      });
      try {
        const report = await getSystemReport();
        for await (const ev of streamMeeting(report)) {
          if (aborted) break;
          send(ev);
        }
        send({ kind: "done" });
      } catch {
        send({ kind: "error" });
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
