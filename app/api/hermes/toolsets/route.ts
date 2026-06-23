import { NextResponse } from "next/server";
import { getToolsets, setToolsetEnabled } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — returns all available toolsets with enabled state. */
export async function GET() {
  try {
    const data = getToolsets();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST { name: string, enabled: boolean } — toggles a toolset. */
export async function POST(req: Request) {
  let body: { name?: string; enabled?: boolean };
  try {
    body = (await req.json()) as { name?: string; enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { name, enabled } = body;
  if (typeof name !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "name (string) and enabled (boolean) are required" },
      { status: 400 }
    );
  }
  try {
    setToolsetEnabled(name, enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
