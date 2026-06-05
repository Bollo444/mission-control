import { NextResponse } from "next/server";
import {
  listVaultTree,
  readVaultFile,
  writeVaultFile,
  searchVault,
  createVaultFile,
  createVaultFolder,
  renameVaultEntry,
  deleteVaultEntry,
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
  const search = url.searchParams.get("search");
  if (search != null) {
    return NextResponse.json({ query: search, hits: searchVault(search) });
  }
  return NextResponse.json({ vaultDir: VAULT_DIR, tree: listVaultTree() });
}

export async function POST(req: Request) {
  let body: { op?: string; path?: string; content?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }

  const op = body.op ?? "save";
  const rel = body.path;
  if (!rel) return NextResponse.json({ ok: false, message: "Missing path" }, { status: 400 });

  let ok = false;
  switch (op) {
    case "save":
      if (body.content == null)
        return NextResponse.json({ ok: false, message: "Missing content" }, { status: 400 });
      ok = writeVaultFile(rel, body.content);
      break;
    case "create":
      ok = createVaultFile(rel, body.content ?? "");
      break;
    case "createFolder":
      ok = createVaultFolder(rel);
      break;
    case "rename":
      if (!body.to) return NextResponse.json({ ok: false, message: "Missing to" }, { status: 400 });
      ok = renameVaultEntry(rel, body.to);
      break;
    case "delete":
      ok = deleteVaultEntry(rel);
      break;
    default:
      return NextResponse.json({ ok: false, message: `Unknown op: ${op}` }, { status: 400 });
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
