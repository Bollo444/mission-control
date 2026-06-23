import { NextResponse } from "next/server";
import { getSystemReport } from "@/lib/system";
import { buildMeetingTemplated, replyToMessage } from "@/lib/meeting";

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
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ turns: [] }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ turns: [] }, { status: 400 });

  const report = await getSystemReport();
  return NextResponse.json({ turns: await replyToMessage(report, message) });
}
