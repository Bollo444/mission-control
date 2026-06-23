import { NextResponse } from "next/server";
import { getSessions } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — returns recent non-archived Hermes sessions (up to 100).
 *
 * NOTE: SQLite WAL mode means rows written since the last checkpoint may not
 * appear in state.db itself — they live in state.db-wal until Hermes
 * checkpoints. This is inherent to WAL and not a bug here; very recent
 * sessions may lag by one Hermes checkpoint cycle.
 */
export async function GET() {
  try {
    const data = await getSessions();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
