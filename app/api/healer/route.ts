import { NextResponse } from "next/server";
import { runHealthCheck, autoRepair } from "@/lib/healer";
import { trackEvent } from "@/lib/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await runHealthCheck();
  trackEvent({ ts: new Date().toISOString(), kind: "healer:run", detail: report.allOk ? "all-ok" : "issues-found" });
  return NextResponse.json(report);
}

export async function POST(req: Request) {
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    body = { action: "repair" };
  }

  if (body.action === "repair") {
    const report = await runHealthCheck();
    const repairs = await autoRepair(report);
    trackEvent({ ts: new Date().toISOString(), kind: "healer:repair", detail: `${repairs.filter((r) => r.ok).length}/${repairs.length} ok` });
    return NextResponse.json({ report, repairs });
  }

  if (body.action === "check") {
    const report = await runHealthCheck();
    return NextResponse.json({ report });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
