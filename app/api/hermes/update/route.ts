import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { home } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pexec = promisify(execFile);
const HERMES = home(".local", "bin", "hermes.exe");

/** Best-effort read of a version string from a command's output. */
function parseVersion(s: string): string | null {
  const m = s.match(/\d+\.\d+\.\d+(?:[.-][0-9A-Za-z.]+)?/);
  return m ? m[0] : null;
}

/**
 * GET — report the installed Hermes version and whether a newer one is on the
 * index (uv). `updateAvailable` is only true when we can positively compare.
 */
export async function GET() {
  let current: string | null = null;
  try {
    const { stdout } = await pexec(HERMES, ["--version"], { timeout: 10_000 });
    current = parseVersion(stdout);
  } catch {
    current = null;
  }

  let latest: string | null = null;
  try {
    // `uv tool` manages hermes-agent; ask the index for the latest version.
    const { stdout } = await pexec("uv", ["pip", "index", "versions", "hermes-agent"], {
      timeout: 15_000,
    });
    latest = parseVersion(stdout);
  } catch {
    latest = null;
  }

  const updateAvailable = !!(current && latest && current !== latest);
  return NextResponse.json({ current, latest, updateAvailable });
}

/**
 * POST — upgrade Hermes via uv. This mutates the system, so it only runs on an
 * explicit click in the UI, never automatically.
 */
export async function POST() {
  try {
    const { stdout, stderr } = await pexec("uv", ["tool", "upgrade", "hermes-agent"], {
      timeout: 180_000,
    });
    return NextResponse.json({ ok: true, output: (stdout || stderr || "").slice(-2000) });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return NextResponse.json(
      { ok: false, error: (err.stderr || err.message || "upgrade failed").slice(-2000) },
      { status: 500 }
    );
  }
}
