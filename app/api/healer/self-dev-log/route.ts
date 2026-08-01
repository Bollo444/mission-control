import { NextRequest, NextResponse } from "next/server";
import { readSelfDevLog } from "@/lib/healer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId") || undefined;
  const limit = parseInt(searchParams.get("limit") || "200", 10);
  const since = searchParams.get("since") || undefined;

  try {
    const entries = readSelfDevLog({ agentId, limit, since });
    return NextResponse.json({ entries });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}