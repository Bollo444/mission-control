import { NextResponse } from "next/server";
import { getPrompts } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ prompts: getPrompts() });
}
