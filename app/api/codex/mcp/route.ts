import { NextResponse } from "next/server";
import { getMcpServers } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getMcpServers());
}
