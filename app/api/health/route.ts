import { NextResponse } from "next/server";
import { readHealth, runHealthCheck } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Last-known free-tier availability + recent failover/restore actions. */
export async function GET() {
  return NextResponse.json(readHealth());
}

/** Run a sweep on demand (the Settings "Check now" button). */
export async function POST() {
  const state = await runHealthCheck({ scheduled: false });
  return NextResponse.json(state);
}
