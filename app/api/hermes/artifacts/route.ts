import { NextResponse } from "next/server";
import { getArtifacts } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — returns aggregated artifact categories from HERMES_HOME. */
export async function GET() {
  try {
    const data = getArtifacts();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
