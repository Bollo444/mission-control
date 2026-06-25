import { NextResponse } from "next/server";
import { runReview } from "@/lib/codex-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { target?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, out: "bad request" }, { status: 400 }); }
  const target = (body.target || ".").trim();
  return NextResponse.json(await runReview(target));
}
