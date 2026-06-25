import { NextResponse } from "next/server";
import { getCloudTasks } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getCloudTasks());
}
