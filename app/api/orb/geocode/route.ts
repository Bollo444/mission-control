import { NextResponse } from "next/server";
import { geocodePlace } from "@/lib/orb/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve a zip code or place name ("10075", "Austin, TX") to coordinates +
 * label. Used by the weather panel's location manager and by the orb's
 * LOCATION: reply marker, so geocoding lives server-side (the public geocoding
 * APIs don't all send CORS headers) and stays testable in lib/orb/tools.
 */
export async function POST(req: Request) {
  let q: string;
  try {
    const body = (await req.json()) as { q?: string };
    q = (body.q ?? "").trim();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  if (!q) return NextResponse.json({ ok: false, error: "empty query" }, { status: 400 });
  const loc = await geocodePlace(q);
  if (!loc) return NextResponse.json({ ok: false, error: `Couldn't find "${q}"` }, { status: 404 });
  return NextResponse.json({ ok: true, loc });
}
