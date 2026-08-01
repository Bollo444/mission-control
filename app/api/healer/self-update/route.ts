import { NextRequest, NextResponse } from "next/server";
import { runSelfUpdateCycle } from "@/lib/healer";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const triggeredBy = (searchParams.get("triggeredBy") as "cron" | "manual" | "health-check") || "manual";
    
    const results = await runSelfUpdateCycle(triggeredBy);
    
    return NextResponse.json({
      ok: true,
      results,
      triggeredBy,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}