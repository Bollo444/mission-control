import { NextResponse } from "next/server";
import { getSkills, setSkillEnabled } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — returns all skill categories and skills with enabled state. */
export async function GET() {
  try {
    const data = getSkills();
    return NextResponse.json(data);
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** POST { skill: string, enabled: boolean } — toggles a skill's active/archived state. */
export async function POST(req: Request) {
  let body: { skill?: string; enabled?: boolean };
  try {
    body = (await req.json()) as { skill?: string; enabled?: boolean };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { skill, enabled } = body;
  if (typeof skill !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "skill (string) and enabled (boolean) are required" },
      { status: 400 }
    );
  }
  try {
    setSkillEnabled(skill, enabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
