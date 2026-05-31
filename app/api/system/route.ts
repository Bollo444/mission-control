import { NextResponse } from "next/server";
import { getSystemReport } from "@/lib/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getSystemReport();
  return NextResponse.json(report);
}
