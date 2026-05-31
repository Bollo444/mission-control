import { NextResponse } from "next/server";
import { readSettings, writeSettings, publicSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(publicSettings(readSettings()));
}

export async function POST(req: Request) {
  let body: {
    routing?: Record<string, { provider: string; model: string }>;
    apiKeys?: Record<string, string>;
    vaultDir?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }
  const next = writeSettings(body);
  return NextResponse.json({ ok: true, settings: publicSettings(next) });
}
