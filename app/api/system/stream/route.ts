import { getSystemReport } from "@/lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE endpoint streaming live SystemReport every 2 seconds.
 * Client connects via EventSource: const es = new EventSource("/api/system/stream")
 * Each event: data: <JSON SystemReport>\n\n
 */
export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial report immediately
      try {
        const report = await getSystemReport();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(report)}\n\n`));
      } catch (e) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "failed to generate report" })}\n\n`));
      }

      // Interval for live updates
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          controller.close();
          return;
        }
        try {
          const report = await getSystemReport();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(report)}\n\n`));
        } catch (e) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "stream error" })}\n\n`));
        }
      }, 2000);

      // Cleanup on client disconnect
      return () => {
        closed = true;
        clearInterval(interval);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}