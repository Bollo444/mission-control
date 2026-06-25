import { NextResponse } from "next/server";
import { getPlugins, getMarketplaces } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [plugins, marketplaces] = await Promise.all([getPlugins(), getMarketplaces()]);
  return NextResponse.json({ plugins, marketplaces });
}
