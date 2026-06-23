import { NextResponse } from "next/server";
import { getProfiles } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — returns all Hermes profiles (default first, then alphabetical). */
export async function GET() {
  try {
    const data = getProfiles();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
