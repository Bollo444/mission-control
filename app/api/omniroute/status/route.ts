import { NextResponse } from "next/server";
import { probe } from "@/lib/omniroute";

export async function GET() {
  const status = await probe();

  return NextResponse.json({
    up: status.up,
    latencyMs: status.latencyMs,
    failoverActive: !status.up,
    omnirouteBase: process.env.OMNIROUTE_BASE_URL || "http://localhost:20128/v1"
  });
}
