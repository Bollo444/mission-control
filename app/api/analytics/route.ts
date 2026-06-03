import { NextRequest, NextResponse } from "next/server";
import { analyticsReport } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Time-windowed gateway analytics (today / 7d / 30d), aggregated per provider. */
export async function GET(req: NextRequest) {
  const w = req.nextUrl.searchParams.get("window") || "7d";
  const days = w === "1d" || w === "today" ? 0 : w === "30d" ? 30 : 7;
  return NextResponse.json({ window: w, rows: analyticsReport(days), generatedAt: new Date().toISOString() });
}
