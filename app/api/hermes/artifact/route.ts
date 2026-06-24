import fs from "node:fs";
import path from "node:path";
import { hermesHome } from "@/lib/hermes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/hermes/artifact?path=<abs>&download=1
 *
 * Serves a single Hermes artifact file as raw bytes (for image/audio preview
 * and text reading in the Artifacts tab). The requested path is HARD
 * allow-listed to the Hermes home — any path resolving outside it is rejected.
 * This is the trust boundary: never serve arbitrary filesystem paths.
 */
const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".yaml": "text/plain; charset=utf-8",
  ".yml": "text/plain; charset=utf-8",
};

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB cap — artifacts, not archives

export async function GET(req: Request) {
  const url = new URL(req.url);
  const requested = url.searchParams.get("path");
  if (!requested) {
    return new Response("missing path", { status: 400 });
  }

  // Trust boundary: resolve and confine to the Hermes home.
  const base = path.resolve(hermesHome());
  const resolved = path.resolve(requested);
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    return new Response("forbidden", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    return new Response("not found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response("not a file", { status: 400 });
  }
  if (stat.size > MAX_BYTES) {
    return new Response("file too large to preview", { status: 413 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const type = TYPES[ext] ?? "application/octet-stream";
  const buf = fs.readFileSync(resolved);
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "no-store",
  };
  if (url.searchParams.get("download")) {
    headers["Content-Disposition"] = `attachment; filename="${path.basename(resolved)}"`;
  }
  return new Response(new Uint8Array(buf), { headers });
}
