import { NextResponse } from "next/server";
import { getSystemReport } from "@/lib/system";
import { buildMeeting, replyToMessage } from "@/lib/meeting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getSystemReport();
  return NextResponse.json(await buildMeeting(report));
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
