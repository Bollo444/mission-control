import { NextResponse } from "next/server";
import { getProfiles, createProfile } from "@/lib/hermes-data";

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

/** POST { name, description?, model?, soul? } — create a subagent profile. */
export async function POST(req: Request) {
  let body: { name?: string; description?: string; model?: string; soul?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const res = createProfile(body.name ?? "", {
    description: body.description,
    model: body.model,
    soul: body.soul,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
