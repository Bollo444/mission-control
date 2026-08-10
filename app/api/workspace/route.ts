import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Workspace file access for the Antigravity IDE surface.
 *   GET  ?dir=<abs>            -> directory listing
 *   GET  ?file=<abs>           -> file text
 *   POST { file, content }     -> write file text
 *
 * TRUST BOUNDARY: every path is confined to the user's HOME directory. Any
 * path resolving outside home is rejected — the IDE never touches the wider
 * filesystem, and writes only land inside home.
 */
const HOME = path.resolve(os.homedir());
const MAX_FILE = 2 * 1024 * 1024; // 2 MB text cap
const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".venv", "__pycache__", ".cache"]);

function confined(p: string): string | null {
  const resolved = path.resolve(p);
  if (resolved !== HOME && !resolved.startsWith(HOME + path.sep)) return null;
  try {
    // Resolve symlinks before authorization so a home-contained link cannot
    // expose or overwrite a file outside HOME.
    const real = fs.realpathSync(resolved);
    if (real !== HOME && !real.startsWith(HOME + path.sep)) return null;
    return real;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const dir = url.searchParams.get("dir");
  const file = url.searchParams.get("file");

  if (file) {
    const p = confined(file);
    if (!p) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) return NextResponse.json({ error: "not a file" }, { status: 400 });
      if (st.size > MAX_FILE) return NextResponse.json({ error: "file too large to edit" }, { status: 413 });
      return NextResponse.json({ path: p, content: fs.readFileSync(p, "utf8") });
    } catch {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
  }

  // No dir → default to home; a dir that escapes home is rejected, not fallen back.
  let target = HOME;
  if (dir) {
    const c = confined(dir);
    if (!c) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    target = c;
  }
  try {
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => !(e.isDirectory() && SKIP_DIRS.has(e.name)))
      .map((e) => {
        const full = path.join(target, e.name);
        let size = 0;
        try { if (e.isFile()) size = fs.statSync(full).size; } catch {}
        return { name: e.name, path: full, isDir: e.isDirectory(), size };
      })
      .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));
    return NextResponse.json({ dir: target, parent: target === HOME ? null : path.dirname(target), entries });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  let body: { file?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const p = body.file ? confined(body.file) : null;
  if (!p) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  if (typeof body.content !== "string") return NextResponse.json({ ok: false, error: "content must be text" }, { status: 400 });
  if (Buffer.byteLength(body.content, "utf8") > MAX_FILE) return NextResponse.json({ ok: false, error: "file too large to edit" }, { status: 413 });
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return NextResponse.json({ ok: false, error: "not a file" }, { status: 400 });
    fs.writeFileSync(p, body.content, "utf8");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "could not write" }, { status: 400 });
  }
}
