import { NextResponse } from "next/server";
import {
  listVaultTree,
  readVaultFile,
  writeVaultFile,
  VAULT_DIR,
} from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (file) {
    const f = readVaultFile(file);
    if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(f);
  }
  return NextResponse.json({ vaultDir: VAULT_DIR, tree: listVaultTree() });
}

export async function POST(req: Request) {
  let body: { path?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }
  if (!body.path || body.content == null) {
    return NextResponse.json({ ok: false, message: "Missing path/content" }, { status: 400 });
  }
  const ok = writeVaultFile(body.path, body.content);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
