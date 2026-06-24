import { NextResponse } from "next/server";
import { getSessionMessages } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hermes/sessions/:id — returns one session's transcript (messages
 * oldest-first, up to 2000) read from Hermes state.db. See the WAL note in
 * the sessions list route: very recent messages may lag one checkpoint cycle.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getSessionMessages(id);
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
