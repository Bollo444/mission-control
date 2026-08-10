import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { execFileSync } from "node:child_process";
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
    return execFileSync("git", args, {
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

function privateIp(value: string): boolean {
  const ip = value.toLowerCase();
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

async function safeRepoUrl(value: string): Promise<boolean> {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname.length <= 1) return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every(({ address }) => !privateIp(address));
  } catch {
    return false;
  }
}

function safeRepoName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
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
  if (!url || !(await safeRepoUrl(url))) return NextResponse.json({ ok: false, error: "only public HTTPS repository URLs are allowed" }, { status: 400 });
  const base = ensureWorkspace();
  const derivedName = path.basename(new URL(url).pathname.replace(/\\.git$/, ""));
  const name = body.name?.trim() || derivedName;
  if (!safeRepoName(name)) return NextResponse.json({ ok: false, error: "invalid repository name" }, { status: 400 });
  const baseReal = path.resolve(base);
  const target = path.resolve(baseReal, name);
  if (target !== baseReal && !target.startsWith(baseReal + path.sep)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (fs.existsSync(target)) {
    return NextResponse.json({ ok: false, error: `"${name}" already exists` }, { status: 409 });
  }
  if (name === "." || name === "..") {
    return NextResponse.json({ ok: false, error: "invalid repository name" }, { status: 400 });
  }
  try {
    execFileSync("git", ["clone", "--", url, target], {
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
  if (!safeRepoName(name)) return NextResponse.json({ ok: false, error: "invalid repository name" }, { status: 400 });
  const base = path.resolve(REPO_WORKSPACE_DIR);
  const target = path.resolve(base, name);
  if (!target.startsWith(base + path.sep)) {
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
