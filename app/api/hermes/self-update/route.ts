import { NextRequest, NextResponse } from "next/server";
import { checkAndUpdateAgent } from "@/lib/healer";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || "hermes";
    
    const result = await checkAndUpdateAgent(agentId);
    
    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}