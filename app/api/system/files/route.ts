import { NextResponse } from "next/server";
import { listSystemFiles, readSystemFile } from "@/lib/sysfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET            → grouped inventory of known system files.
 * GET ?path=...  → contents of one allow-listed file.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams.get("path");
  if (p) {
    const result = readSystemFile(p);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  return NextResponse.json({ groups: listSystemFiles() });
}
