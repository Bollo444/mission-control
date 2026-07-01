import { NextResponse } from "next/server";
import { buildVaultGraph } from "@/lib/memory-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(buildVaultGraph());
}
