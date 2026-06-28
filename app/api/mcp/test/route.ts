import { NextRequest, NextResponse } from "next/server";
import { listTools } from "@/lib/mcp";

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  try {
    const tools = await listTools(id);
    return NextResponse.json({ ok: true, tools });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
