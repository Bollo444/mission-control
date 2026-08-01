import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { NextResponse } from "next/server";
import { deploySubagent } from "@/lib/subagents";
import { REPO_WORKSPACE_DIR } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RepoInfo {
  name: string;
  path: string;
  /** ISO mtime of HEAD's commit. */
  lastPushed: string | null;
  /** Current branch name. */
  branch: string | null;
  /** Dirty (uncommitted) changes. */
  dirty: boolean;
  /** True if the dir is present and has a .git. */
  valid: boolean;
  /** Error message from git introspection (non-fatal). */
  error?: string;
}

function ensureWorkspace(): string {
  fs.mkdirSync(REPO_WORKSPACE_DIR, { recursive: true });
  return REPO_WORKSPACE_DIR;
}

function git(dir: string, ...args: string[]): string {
  try {
    return execSync(`git ${args.join(" ")}`, {
      cwd: dir,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return "";
  }
}

function inspectRepo(dir: string): RepoInfo {
  const name = path.basename(dir);
  const gitDir = path.join(dir, ".git");
  if (!fs.existsSync(gitDir)) {
    return { name, path: dir, lastPushed: null, branch: null, dirty: false, valid: false };
  }
  try {
    const branch = git(dir, "rev-parse", "--abbrev-ref", "HEAD") || null;
    const dirty = !!git(dir, "status", "--porcelain");
    const lastPushed = git(dir, "log", "-1", "--format=%cI", "--") || null;
    return { name, path: dir, lastPushed, branch, dirty, valid: true };
  } catch (e) {
    return { name, path: dir, lastPushed: null, branch: null, dirty: false, valid: false, error: (e as Error).message };
  }
}

export async function GET() {
  const base = ensureWorkspace();
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const repos = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith("."))
    .map((e) => inspectRepo(path.join(base, e.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ dir: base, repos });
}

export async function POST(req: Request) {
  let body: { url?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
  const base = ensureWorkspace();
  const name = body.name?.trim() || path.basename(url.replace(/\.git$/, ""));
  const target = path.join(base, name);
  if (fs.existsSync(target)) {
    return NextResponse.json({ ok: false, error: `"${name}" already exists` }, { status: 409 });
  }
  try {
    execSync(`git clone "${url}" "${name}"`, {
      cwd: base,
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const info = inspectRepo(target);
    return NextResponse.json({ ok: true, repo: info });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const name = url.searchParams.get("name")?.trim();
  if (!name) return NextResponse.json({ ok: false, error: "name is required" }, { status: 400 });
  const target = path.join(REPO_WORKSPACE_DIR, name);
  if (!target.startsWith(REPO_WORKSPACE_DIR)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!fs.existsSync(target)) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  try {
    fs.rmSync(target, { recursive: true, force: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
