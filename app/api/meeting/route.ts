import { NextResponse } from "next/server";
import { getSystemReport } from "@/lib/system";
import { buildMeetingTemplated, replyToMessage } from "@/lib/meeting";
import { logEvent } from "@/lib/logbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the metric-grounded meeting INSTANTLY — every line is templated from
 * the live system report, with no model in the request path, so the boardroom
 * always convenes at once. Live-LLM upgrades stream separately from
 * /api/meeting/stream and patch the turns in place.
 */
export async function GET() {
  const report = await getSystemReport();
  return NextResponse.json(buildMeetingTemplated(report));
}

export async function POST(req: Request) {
  let body: { message?: string; event?: "start" | "finish" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ turns: [] }, { status: 400 });
  }

  // Annotate the universal log when a meeting is convened or adjourned.
  if (body.event === "start" || body.event === "finish") {
    logEvent({
      source: "system",
      level: "info",
      event: body.event === "start" ? "Team meeting convened" : "Team meeting adjourned",
    });
    return NextResponse.json({ ok: true });
  }

  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ turns: [] }, { status: 400 });

  const report = await getSystemReport();
  return NextResponse.json(await replyToMessage(report, message));
}
