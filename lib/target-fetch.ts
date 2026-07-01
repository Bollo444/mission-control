import fs from "node:fs";
import path from "node:path";
import { readSettings } from "./settings";

/*
  Target collector for the Sentinel swarm. Turns a raw target string — a page
  URL, a GitHub repo URL, or a local filesystem path — into a distilled text
  briefing that gets prepended to the objective so each hat reasons over real
  facts instead of just a description.

  ponytail: this deliberately fetches whatever target you give it (that's the
  whole point of "security-test anything"). It is a local, single-user tool for
  AUTHORIZED targets only — no SSRF allow-listing, by design.
*/

const MAX_BYTES = 16_000;
const FETCH_TIMEOUT_MS = 15_000;

export type TargetKind = "url" | "github" | "path" | "none";
export interface TargetContext {
  kind: TargetKind;
  summary: string;
}

function clip(s: string, n = MAX_BYTES): string {
  return s.length > n ? `${s.slice(0, n)}\n…[truncated ${s.length - n} chars]` : s;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function httpGet(
  url: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; headers: Headers; body: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "MissionControl-Sentinel/1.0", ...headers },
    });
    const body = await res.text().catch(() => "");
    return { status: res.status, headers: res.headers, body };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function githubToken(): string | undefined {
  const s = readSettings();
  return s.apiKeys?.GITHUB_TOKEN || process.env.GITHUB_TOKEN || undefined;
}

// ---- GitHub repo ----

async function collectGitHub(owner: string, repo: string): Promise<TargetContext> {
  const token = githubToken();
  const gh = (p: string, auth: boolean) =>
    httpGet(`https://api.github.com/repos/${owner}/${repo}${p}`, {
      accept: "application/vnd.github+json",
      ...(auth && token ? { authorization: `Bearer ${token}` } : {}),
    });

  // A stale/invalid token yields 401 — public-repo recon still works
  // unauthenticated, so drop the bad token and retry rather than giving up.
  let auth = Boolean(token);
  let meta = await gh("", auth);
  if (meta && meta.status === 401 && auth) {
    auth = false;
    meta = await gh("", false);
  }
  if (!meta || meta.status >= 400) {
    return { kind: "github", summary: `GitHub API returned ${meta?.status ?? "no response"} for ${owner}/${repo}. Repo may be private or nonexistent.` };
  }
  const m = JSON.parse(meta.body || "{}") as Record<string, unknown>;

  const [langsRes, treeRes, readmeRes] = await Promise.all([
    gh("/languages", auth),
    gh("/contents/", auth),
    gh("/readme", auth),
  ]);

  const langs = langsRes && langsRes.status < 400 ? Object.keys(JSON.parse(langsRes.body || "{}")) : [];
  const tree =
    treeRes && treeRes.status < 400
      ? (JSON.parse(treeRes.body || "[]") as Array<{ name: string; type: string }>).map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`)
      : [];
  let readme = "";
  if (readmeRes && readmeRes.status < 400) {
    const r = JSON.parse(readmeRes.body || "{}") as { content?: string; encoding?: string };
    if (r.content && r.encoding === "base64") {
      readme = Buffer.from(r.content, "base64").toString("utf8").slice(0, 6000);
    }
  }

  const parts = [
    `GitHub repository: ${owner}/${repo}`,
    m.description ? `Description: ${m.description}` : "",
    `Primary language: ${m.language ?? "unknown"} · all languages: ${langs.join(", ") || "n/a"}`,
    `Stars: ${m.stargazers_count ?? "?"} · open issues: ${m.open_issues_count ?? "?"} · default branch: ${m.default_branch ?? "?"}`,
    m.homepage ? `Homepage: ${m.homepage}` : "",
    "",
    "Top-level tree:",
    tree.length ? tree.join("\n") : "(unavailable)",
    "",
    "README excerpt:",
    readme || "(no README found)",
  ].filter(Boolean);

  return { kind: "github", summary: clip(parts.join("\n")) };
}

// ---- Generic web page ----

const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "server",
  "x-powered-by",
  "set-cookie",
];

async function collectUrl(url: string): Promise<TargetContext> {
  const res = await httpGet(url);
  if (!res) return { kind: "url", summary: `Could not reach ${url} (timeout or network error).` };

  const secHeaders = SECURITY_HEADERS.filter((h) => res.headers.has(h)).map(
    (h) => `${h}: ${res.headers.get(h)}`
  );
  const missing = ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options"].filter(
    (h) => !res.headers.has(h)
  );
  const formCount = (res.body.match(/<form\b/gi) || []).length;
  const inputCount = (res.body.match(/<input\b/gi) || []).length;
  const scriptSrcs = Array.from(res.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi))
    .map((mm) => mm[1])
    .slice(0, 20);
  const text = stripHtml(res.body).slice(0, 4000);

  const parts = [
    `URL: ${url}`,
    `HTTP status: ${res.status}`,
    `Content-Type: ${res.headers.get("content-type") ?? "unknown"}`,
    "",
    "Security-relevant response headers present:",
    secHeaders.length ? secHeaders.join("\n") : "(none of the common ones)",
    "",
    `Missing hardening headers: ${missing.length ? missing.join(", ") : "none"}`,
    `Forms: ${formCount} · input fields: ${inputCount}`,
    scriptSrcs.length ? `\nExternal scripts:\n${scriptSrcs.join("\n")}` : "",
    "",
    "Visible text excerpt:",
    text || "(no text extracted)",
  ].filter(Boolean);

  return { kind: "url", summary: clip(parts.join("\n")) };
}

// ---- Local filesystem path ----

const MANIFESTS = new Set([
  "package.json", "requirements.txt", "pyproject.toml", "go.mod", "cargo.toml",
  "pom.xml", "build.gradle", "gemfile", "composer.json", "dockerfile",
  ".env.example", "readme.md", "readme",
]);

function collectPath(target: string): TargetContext {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return { kind: "none", summary: "" };
  }
  const root = stat.isDirectory() ? target : path.dirname(target);
  const tree: string[] = [];
  const manifests: string[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 2 || tree.length > 300) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || e.name.startsWith(".next")) continue;
      const full = path.join(dir, e.name);
      tree.push(`${"  ".repeat(depth)}${e.isDirectory() ? "📁" : "📄"} ${e.name}`);
      if (e.isFile() && MANIFESTS.has(e.name.toLowerCase()) && manifests.length < 6) {
        try {
          if (fs.statSync(full).size < 8000) {
            manifests.push(`--- ${path.relative(root, full)} ---\n${fs.readFileSync(full, "utf8").slice(0, 3000)}`);
          }
        } catch { /* skip */ }
      }
      if (e.isDirectory()) walk(full, depth + 1);
    }
  };
  walk(root, 0);

  const parts = [
    `Local path: ${target}`,
    "",
    "File tree (depth ≤ 2):",
    tree.join("\n") || "(empty)",
    "",
    "Manifest / config file contents:",
    manifests.join("\n\n") || "(none found)",
  ];
  return { kind: "path", summary: clip(parts.join("\n")) };
}

// ---- Dispatch ----

/** Distill a raw target (URL, GitHub repo, or local path) into a text briefing. */
export async function collectTarget(raw: string): Promise<TargetContext> {
  const target = raw.trim();
  if (!target) return { kind: "none", summary: "" };

  if (/^https?:\/\//i.test(target)) {
    const gh = target.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/i);
    if (gh) return collectGitHub(gh[1], gh[2].replace(/\.git$/, ""));
    return collectUrl(target);
  }
  // Anything else that exists on disk is treated as a local path.
  return collectPath(target);
}
