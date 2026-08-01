"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFetch } from "@/lib/useFetch";
import type {
  AgentDetail,
  MemoryResp,
  SystemReport,
  VaultTreeResp,
} from "@/lib/types";
import { hexA, relTime, stateColor } from "@/lib/format";
import { AntigravityMascot } from "@/components/skins/mascots";
import { AntigravityBg } from "@/components/skins/backgrounds";
import FleetTerminal from "./FleetTerminal";
import NativeTerminal from "./NativeTerminal";
import AntigravityWorkspace from "./AntigravityWorkspace";
import WindowControls from "./WindowControls";
import LaunchControls from "@/components/LaunchControls";

const ACCENT = "#6ea8fe";

type Panel = "explorer" | "workspace" | "search" | "agents" | "scm" | "repos" | "health";

interface RepoInfo {
  name: string;
  path: string;
  lastPushed: string | null;
  branch: string | null;
  dirty: boolean;
  valid: boolean;
  error?: string;
}

interface SearchHit {
  path: string;
  line: number;
  text: string;
}

interface OpenDoc {
  path: string;
  name: string;
  content: string;
  saved: string;
  loading: boolean;
}

const ACTIVITY = [
  { id: "explorer", icon: "⛶", label: "Explorer · Vault" },
  { id: "workspace", icon: "🗂", label: "Workspace · project files" },
  { id: "repos", icon: "⬇", label: "Repos · cloned git repos" },
  { id: "search", icon: "⌕", label: "Search vault contents" },
  { id: "agents", icon: "▦", label: "Agent manager" },
  { id: "scm", icon: "⎇", label: "Source control · activity" },
  { id: "health", icon: "◈", label: "Health · self-heal + learn" },
] as const;

function fileLabel(p: string) {
  return p.split("/").pop() || p;
}

export default function AntigravityIde({ agent }: { agent: AgentDetail }) {
  const router = useRouter();
  const { data: mem } = useFetch<MemoryResp>("/api/memory", 12000);
  const { data: vault, reload: reloadVault } = useFetch<VaultTreeResp>("/api/vault", 0);
  const { data: sys } = useFetch<SystemReport>("/api/system", 5000);

  const [panel, setPanel] = useState<Panel>("explorer");
  const [search, setSearch] = useState("");
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [active, setActive] = useState<string>("welcome");
  const [termOpen, setTermOpen] = useState(true);
  const [termTab, setTermTab] = useState<"cli" | "fleet">("cli");
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloning, setCloning] = useState(false);
  const [dispatchRepo, setDispatchRepo] = useState<string | null>(null);
  const [dispatchAgent, setDispatchAgent] = useState("");
  const [dispatchTask, setDispatchTask] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [healthReport, setHealthReport] = useState<{ ts: string; checks: { name: string; ok: boolean; detail: string; fixable: boolean }[]; allOk: boolean } | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairLog, setRepairLog] = useState<{ action: string; ok: boolean; detail: string }[]>([]);
  const [insights, setInsights] = useState<{ type: string; label: string; detail: string }[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const tree = vault?.tree ?? [];
  const files = useMemo(() => tree.filter((n) => !n.dir), [tree]);
  const vaultDir = mem?.vaultDir ?? "…";
  const fleet = sys?.fleet.agents ?? [];
  const readyCount = sys?.fleet.ready ?? 0;
  const fleetTotal = sys?.fleet.total ?? 0;

  const openFile = useCallback(async (path: string) => {
    setActive(path);
    setOrder((o) => (o.includes(path) ? o : [...o, path]));
    setDocs((d) =>
      d[path]
        ? d
        : { ...d, [path]: { path, name: fileLabel(path), content: "", saved: "", loading: true } }
    );
    try {
      const res = await fetch(`/api/vault?file=${encodeURIComponent(path)}`, { cache: "no-store" });
      const json = await res.json();
      const content = res.ok ? json.content : `// could not open ${path}`;
      setDocs((d) => ({ ...d, [path]: { path, name: fileLabel(path), content, saved: content, loading: false } }));
      track("file:open", path);
    } catch {
      setDocs((d) => ({ ...d, [path]: { path, name: fileLabel(path), content: `// error reading ${path}`, saved: "", loading: false } }));
    }
  }, []);

  // Open the agent's own note by default once the tree is available.
  useEffect(() => {
    if (order.length === 0 && active === "welcome" && files.length) {
      const mine = files.find((n) => n.path.endsWith("Antigravity.md"));
      if (mine) openFile(mine.path);
    }
  }, [files, order.length, active, openFile]);

  const activeDoc = active !== "welcome" ? docs[active] : undefined;
  const dirty = activeDoc ? activeDoc.content !== activeDoc.saved : false;

  const save = useCallback(async () => {
    if (!activeDoc || activeDoc.content === activeDoc.saved) return;
    setSaving(true);
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: activeDoc.path, content: activeDoc.content }),
      });
      if (res.ok) {
        setDocs((d) => ({ ...d, [activeDoc.path]: { ...d[activeDoc.path], saved: d[activeDoc.path].content } }));
        setToast("Saved to vault ✓");
        setTimeout(() => setToast(""), 1800);
        track("file:save", activeDoc.path);
      } else setToast("Save failed");
    } finally {
      setSaving(false);
    }
  }, [activeDoc]);

  const closeTab = useCallback(
    (path: string) => {
      setOrder((o) => {
        const next = o.filter((p) => p !== path);
        setActive((cur) => (cur === path ? next[next.length - 1] ?? "welcome" : cur));
        return next;
      });
    },
    []
  );

  // Vault file operations (create / folder / rename / delete).
  const vaultOp = useCallback(
    async (op: string, p: string, extra?: Record<string, unknown>) => {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op, path: p, ...extra }),
      });
      await reloadVault();
      return res.ok;
    },
    [reloadVault]
  );

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 1600);
  }, []);

  // Open the desktop ZCode editor at the repo workspace (escape hatch from the web IDE).
  const openInZCode = useCallback(async () => {
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "zcode", action: "launch" }),
      });
      const json = await res.json();
      flash(json.ok ? "Opening ZCode…" : json.message || "ZCode not found");
    } catch {
      flash("Launch failed");
    }
  }, [flash]);

  const newFile = useCallback(async () => {
    const name = window.prompt("New note path (relative to the vault), e.g. Notes/idea.md");
    if (!name) return;
    const rel = /\.[a-z0-9]+$/i.test(name) ? name : `${name}.md`;
    const title = fileLabel(rel).replace(/\.[a-z0-9]+$/i, "");
    const ok = await vaultOp("create", rel, { content: `# ${title}\n\n` });
    if (ok) {
      flash("Created ✓");
      void openFile(rel);
    } else flash("Create failed (exists?)");
  }, [vaultOp, openFile, flash]);

  const newFolder = useCallback(async () => {
    const name = window.prompt("New folder path (relative to the vault)");
    if (!name) return;
    flash((await vaultOp("createFolder", name)) ? "Folder created ✓" : "Create failed");
  }, [vaultOp, flash]);

  const renameEntry = useCallback(
    async (p: string) => {
      const to = window.prompt("Rename / move to (vault-relative path):", p);
      if (!to || to === p) return;
      const ok = await vaultOp("rename", p, { to });
      if (ok) {
        flash("Renamed ✓");
        if (active === p) {
          closeTab(p);
          void openFile(to);
        }
      } else flash("Rename failed");
    },
    [vaultOp, active, closeTab, openFile, flash]
  );

  const deleteEntry = useCallback(
    async (p: string) => {
      if (!window.confirm(`Delete "${p}"? This cannot be undone.`)) return;
      const ok = await vaultOp("delete", p);
      if (ok) {
        flash("Deleted ✓");
        if (active === p) closeTab(p);
      } else flash("Delete failed");
    },
    [vaultOp, active, closeTab, flash]
  );

  const toggleCollapse = useCallback((p: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }, []);

  const hiddenByCollapse = useCallback(
    (p: string) => {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) {
        if (collapsed.has(parts.slice(0, i).join("/"))) return true;
      }
      return false;
    },
    [collapsed]
  );

  const track = useCallback((kind: string, detail?: string) => {
    fetch("/api/learning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, detail }),
    }).catch(() => {});
  }, []);

  const runHealthCheck = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/healer", { cache: "no-store" });
      const json = await res.json();
      setHealthReport(json);
    } catch {
      setHealthReport(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  const runRepair = useCallback(async () => {
    setRepairing(true);
    try {
      const res = await fetch("/api/healer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "repair" }),
      });
      const json = await res.json();
      setHealthReport(json.report);
      setRepairLog(json.repairs ?? []);
    } catch {
      setRepairLog([{ action: "repair", ok: false, detail: "Repair request failed" }]);
    } finally {
      setRepairing(false);
    }
  }, []);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch("/api/learning", { cache: "no-store" });
      const json = await res.json();
      setInsights(json.insights ?? []);
    } catch {
      setInsights([]);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    try {
      const res = await fetch("/api/repos", { cache: "no-store" });
      const json = await res.json();
      setRepos(json.repos ?? []);
    } catch {
      setRepos([]);
    } finally {
      setReposLoading(false);
    }
  }, []);

  const cloneRepo = useCallback(async () => {
    const url = cloneUrl.trim();
    if (!url) return;
    setCloning(true);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (json.ok) {
        setCloneUrl("");
        flash(`Cloned ${json.repo.name} ✓`);
        track("repo:clone", json.repo.name);
        await loadRepos();
      } else {
        flash(json.error || "Clone failed");
      }
    } catch {
      flash("Clone failed");
    } finally {
      setCloning(false);
    }
  }, [cloneUrl, loadRepos, flash, track]);

  const deleteRepo = useCallback(
    async (name: string) => {
      if (!window.confirm(`Delete "${name}"? This removes the repo from disk.`)) return;
      try {
        const res = await fetch(`/api/repos?name=${encodeURIComponent(name)}`, { method: "DELETE" });
        const json = await res.json();
        if (json.ok) {
          flash(`Deleted ${name} ✓`);
          track("repo:delete", name);
          await loadRepos();
        } else flash(json.error || "Delete failed");
      } catch {
        flash("Delete failed");
      }
    },
    [loadRepos, flash, track]
  );

  const dispatchToRepo = useCallback(
    async (repo: RepoInfo) => {
      if (!dispatchAgent || !dispatchTask.trim()) return;
      try {
        const res = await fetch("/api/subagents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            agentId: dispatchAgent,
            task: `In the repository at ${repo.path}, ${dispatchTask.trim()}`,
          }),
        });
        const json = await res.json();
        if (json.ok) {
          flash(`Dispatched ${dispatchAgent} on ${repo.name} ✓`);
          track("agent:dispatch", dispatchAgent);
          setDispatchRepo(null);
          setDispatchAgent("");
          setDispatchTask("");
        } else flash(json.error || "Dispatch failed");
      } catch {
        flash("Dispatch failed");
      }
    },
    [dispatchAgent, dispatchTask, flash, track]
  );

  // Load panel-specific data on switch.
  useEffect(() => {
    if (panel === "repos") void loadRepos();
    if (panel === "health") { void runHealthCheck(); void loadInsights(); }
  }, [panel, loadRepos, runHealthCheck, loadInsights]);

  // Debounced content search across the whole vault (Search panel only).
  useEffect(() => {
    if (panel !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        track("search:query", q);
        const res = await fetch(`/api/vault?search=${encodeURIComponent(q)}`, { cache: "no-store" });
        const json = await res.json();
        setHits(json.hits ?? []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, panel]);

  // Global keys: Ctrl+S save, Ctrl+K palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  function trackCursor(el: HTMLTextAreaElement) {
    const upto = el.value.slice(0, el.selectionStart);
    const lines = upto.split("\n");
    setCursor({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  }

  const lineCount = activeDoc ? activeDoc.content.split("\n").length : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0d16] text-[var(--color-ink)]">
      {/* title bar (Windows chrome) */}
      <div className="flex h-9 shrink-0 items-center border-b border-white/10">
        <div className="flex items-center gap-2 px-3 text-xs text-[var(--color-ink-3)]">
          <AntigravityMascot size={18} />
          <span className="font-semibold text-[var(--color-ink)]">Antigravity</span>
          <span className="text-[var(--color-ink-4)]">— Integrated Workspace</span>
        </div>
        <button
          onClick={() => void openInZCode()}
          title="Launch the desktop ZCode editor"
          className="ml-auto mr-2 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-[var(--color-ink-3)] hover:bg-white/5"
          style={{ color: "#f04d8b", borderColor: "rgba(240,77,139,0.4)" }}
        >
          ✦ Open in ZCode ↗
        </button>
        <button
          onClick={() => setPaletteOpen(true)}
          className="ml-2 mr-2 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-[var(--color-ink-4)] hover:bg-white/5"
        >
          Ctrl+K command palette
        </button>
        <WindowControls />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* activity bar */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-2 border-r border-white/10 py-3">
          {ACTIVITY.map((it) => {
            const on = panel === it.id;
            return (
              <button
                key={it.id}
                title={it.label}
                onClick={() => { setPanel(it.id as Panel); track("panel:switch", it.id); }}
                className="grid h-9 w-9 place-items-center rounded-md text-lg"
                style={{
                  color: on ? ACCENT : "var(--color-ink-4)",
                  background: on ? "rgba(110,168,254,0.14)" : "transparent",
                  boxShadow: on ? `inset 2px 0 0 ${ACCENT}` : "none",
                }}
              >
                {it.icon}
              </button>
            );
          })}
          <div className="mt-auto flex flex-col items-center gap-2">
            <button
              title="Team meeting"
              onClick={() => router.push("/meeting")}
              className="grid h-9 w-9 place-items-center rounded-md text-lg text-[var(--color-ink-4)] hover:text-[var(--color-ink-2)]"
            >
              ✦
            </button>
            <button
              title="Toggle terminal"
              onClick={() => setTermOpen((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-md text-lg"
              style={{ color: termOpen ? ACCENT : "var(--color-ink-4)" }}
            >
              ▤
            </button>
          </div>
        </div>

        {/* side panel */}
        <div className="hidden w-64 shrink-0 flex-col border-r border-white/10 lg:flex">
          {panel === "explorer" && (
            <SidePanel title="Explorer · Vault" count={files.length}>
              <div className="mx-2 mb-2 flex items-center gap-1">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter files…"
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs outline-none placeholder:text-[var(--color-ink-4)]"
                />
                <button
                  title="New note"
                  onClick={newFile}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded border border-white/10 text-[14px] leading-none text-[var(--color-ink-3)] hover:bg-white/5"
                >
                  ＋
                </button>
                <button
                  title="New folder"
                  onClick={newFolder}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded border border-white/10 text-[12px] leading-none text-[var(--color-ink-3)] hover:bg-white/5"
                >
                  ⊞
                </button>
              </div>
              <div className="flex-1 overflow-auto px-1 pb-3 text-[13px]">
                {tree
                  .filter((n) =>
                    search ? n.name.toLowerCase().includes(search.toLowerCase()) : !hiddenByCollapse(n.path)
                  )
                  .map((node) => {
                    const on = node.path === active;
                    const isCollapsed = collapsed.has(node.path);
                    return (
                      <div key={node.path} className="group flex items-center">
                        <button
                          onClick={() => (node.dir ? toggleCollapse(node.path) : openFile(node.path))}
                          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-left"
                          style={{
                            paddingLeft: 8 + node.depth * 14,
                            color: on ? ACCENT : node.dir ? "var(--color-ink-2)" : "var(--color-ink-3)",
                            background: on ? "rgba(110,168,254,0.12)" : "transparent",
                            fontWeight: node.dir ? 600 : 400,
                          }}
                        >
                          <span className="text-[var(--color-ink-4)]">
                            {node.dir ? (isCollapsed ? "▸" : "▾") : "›"}
                          </span>
                          <span className="truncate">{node.name}</span>
                        </button>
                        <span className="mr-1 hidden shrink-0 gap-0.5 group-hover:flex">
                          <button
                            title="Rename / move"
                            onClick={() => renameEntry(node.path)}
                            className="rounded px-1 text-[11px] text-[var(--color-ink-4)] hover:bg-white/10 hover:text-[var(--color-ink)]"
                          >
                            ✎
                          </button>
                          <button
                            title="Delete"
                            onClick={() => deleteEntry(node.path)}
                            className="rounded px-1 text-[11px] text-[var(--color-ink-4)] hover:bg-white/10 hover:text-[var(--color-pink)]"
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                    );
                  })}
              </div>
            </SidePanel>
          )}

          {panel === "workspace" && (
            <SidePanel title="Workspace · project files" count={0}>
              <AntigravityWorkspace />
            </SidePanel>
          )}

          {panel === "repos" && (
            <SidePanel title="Repos · cloned" count={repos.length}>
              <div className="mx-2 mb-2 flex items-center gap-1">
                <input
                  value={cloneUrl}
                  onChange={(e) => setCloneUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void cloneRepo(); }}
                  placeholder="git clone URL…"
                  disabled={cloning}
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs outline-none placeholder:text-[var(--color-ink-4)] disabled:opacity-40"
                />
                <button
                  onClick={cloneRepo}
                  disabled={cloning || !cloneUrl.trim()}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded border border-white/10 text-[14px] leading-none text-[var(--color-ink-3)] hover:bg-white/5 disabled:opacity-40"
                  title="Clone"
                >
                  ⤓
                </button>
              </div>
              <div className="flex-1 overflow-auto px-1 pb-3">
                {reposLoading && (
                  <div className="px-3 py-2 text-xs text-[var(--color-ink-4)]">Loading repos…</div>
                )}
                {!reposLoading && repos.length === 0 && (
                  <div className="px-3 py-2 text-xs text-[var(--color-ink-4)]">No repos cloned yet. Paste a git URL above to clone.</div>
                )}
                {repos.map((r) => (
                  <div key={r.name} className="group mb-1 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: r.valid ? ACCENT : "var(--color-ink-4)" }}>
                        {r.valid ? (r.dirty ? "⬡" : "⎇") : "⊟"}
                      </span>
                      <span className="truncate text-[13px] font-medium">{r.name}</span>
                      {r.dirty && (
                        <span className="shrink-0 text-[11px] text-[var(--color-orange)]">● dirty</span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--color-ink-4)]">
                      {r.valid && r.branch && <span>⎇ {r.branch}</span>}
                      {r.lastPushed && <span>{new Date(r.lastPushed).toLocaleDateString()}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <button
                        onClick={() => { setTermOpen(true); setTermTab("cli"); }}
                        className="rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: hexA(ACCENT, 0.16), color: ACCENT }}
                      >
                        ⎇ Terminal
                      </button>
                      {r.valid && (
                        <button
                          onClick={() => {
                            setDispatchRepo(r.name);
                            setDispatchAgent("");
                            setDispatchTask("");
                          }}
                          className="rounded px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: hexA(ACCENT, 0.16), color: ACCENT }}
                        >
                          ▦ Agent
                        </button>
                      )}
                      <button
                        onClick={() => deleteRepo(r.name)}
                        className="ml-auto rounded px-2 py-0.5 text-[11px] text-[var(--color-ink-4)] hover:bg-white/10"
                      >
                        ✕
                      </button>
                    </div>
                    {dispatchRepo === r.name && (
                      <div className="mt-2 border-t border-white/10 pt-2">
                        <select
                          value={dispatchAgent}
                          onChange={(e) => setDispatchAgent(e.target.value)}
                          className="mb-1 w-full rounded border border-white/10 bg-black/20 px-2 py-1 text-xs outline-none"
                        >
                          <option value="">Select agent…</option>
                          {sys?.fleet.agents.filter((a) => a.state === "ready").map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <textarea
                          value={dispatchTask}
                          onChange={(e) => setDispatchTask(e.target.value)}
                          placeholder="Describe the task…"
                          rows={2}
                          className="mb-1 w-full resize-none rounded border border-white/10 bg-black/20 px-2 py-1 text-xs outline-none placeholder:text-[var(--color-ink-4)]"
                        />
                        <div className="flex gap-1">
                          <button
                            onClick={() => dispatchToRepo(r)}
                            disabled={!dispatchAgent || !dispatchTask.trim()}
                            className="rounded px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40"
                            style={{ background: hexA(ACCENT, 0.16), color: ACCENT }}
                          >
                            Run on {r.name}
                          </button>
                          <button
                            onClick={() => setDispatchRepo(null)}
                            className="rounded px-2 py-0.5 text-[11px] text-[var(--color-ink-4)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SidePanel>
          )}

          {panel === "health" && (
            <SidePanel title="Health · self-healing + learning" count={0}>
              <div className="flex-1 overflow-auto px-2 pb-3 text-[12px]">
                <div className="mb-2 flex gap-1">
                  <button
                    onClick={runHealthCheck}
                    disabled={healthLoading}
                    className="rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-40"
                    style={{ background: hexA(ACCENT, 0.16), color: ACCENT }}
                  >
                    {healthLoading ? "Checking…" : "⟳ Health check"}
                  </button>
                  <button
                    onClick={runRepair}
                    disabled={repairing || !healthReport || healthReport.allOk}
                    className="rounded px-2 py-1 text-[11px] font-semibold disabled:opacity-40"
                    style={{ background: "rgba(255,68,56,0.16)", color: "#ff4438" }}
                  >
                    {repairing ? "Repairing…" : "⚡ Auto-repair"}
                  </button>
                </div>

                {healthReport && (
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                      <span style={{ color: healthReport.allOk ? "var(--color-green)" : "var(--color-orange)" }}>
                        {healthReport.allOk ? "◉ All healthy" : "◉ Issues found"}
                      </span>
                      <span className="text-[10px] text-[var(--color-ink-4)]">{new Date(healthReport.ts).toLocaleTimeString()}</span>
                    </div>
                    {healthReport.checks.map((c) => (
                      <div key={c.name} className="flex items-start gap-2 py-1">
                        <span className="mt-0.5 shrink-0" style={{ color: c.ok ? "var(--color-green)" : "var(--color-rose)" }}>
                          {c.ok ? "●" : "○"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium">{c.name}</div>
                          <div className="truncate text-[10px] text-[var(--color-ink-4)]">{c.detail}</div>
                        </div>
                        {!c.ok && c.fixable && (
                          <span className="shrink-0 text-[10px] text-[var(--color-orange)]">fixable</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {repairLog.length > 0 && (
                  <div className="mb-3 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">
                      Repair log
                    </div>
                    {repairLog.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5 text-[11px]">
                        <span style={{ color: r.ok ? "var(--color-green)" : "var(--color-rose)" }}>
                          {r.ok ? "✓" : "✕"}
                        </span>
                        <span className="truncate">{r.detail}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">
                  Learning · patterns
                </div>
                {insightsLoading && (
                  <div className="px-2 py-2 text-xs text-[var(--color-ink-4)]">Analyzing usage patterns…</div>
                )}
                {!insightsLoading && insights.length === 0 && (
                  <div className="px-2 py-2 text-xs text-[var(--color-ink-4)]">Keep using the dashboard — insights appear as patterns emerge.</div>
                )}
                {insights.map((ins, i) => (
                  <div key={i} className="mb-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[var(--color-green)]">◈</span>
                      <span className="text-[11px] font-medium">{ins.label}</span>
                    </div>
                    <div className="pl-4 text-[10px] text-[var(--color-ink-4)]">{ins.detail}</div>
                  </div>
                ))}
                {!insightsLoading && insights.length > 0 && (
                  <button
                    onClick={loadInsights}
                    className="mb-2 mt-1 w-full rounded px-2 py-1 text-[11px] text-[var(--color-ink-4)] hover:bg-white/5"
                  >
                    ⟳ Refresh insights
                  </button>
                )}
              </div>
            </SidePanel>
          )}

          {panel === "search" && (
            <SidePanel title="Search · Vault contents" count={hits.length}>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search across all notes…"
                className="mx-2 mb-2 rounded border border-white/10 bg-black/20 px-2 py-1 text-xs outline-none placeholder:text-[var(--color-ink-4)]"
              />
              <div className="flex-1 overflow-auto px-1 pb-3">
                {searching && <div className="px-3 py-2 text-xs text-[var(--color-ink-4)]">Searching…</div>}
                {!searching && query.trim().length >= 2 && hits.length === 0 && (
                  <div className="px-3 py-2 text-xs text-[var(--color-ink-4)]">No matches.</div>
                )}
                {hits.map((h, i) => (
                  <button
                    key={`${h.path}:${h.line}:${i}`}
                    onClick={() => openFile(h.path)}
                    className="block w-full rounded px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <div className="flex items-baseline gap-1 text-[11px]">
                      <span className="truncate" style={{ color: ACCENT }}>
                        {fileLabel(h.path)}
                      </span>
                      <span className="text-[var(--color-ink-4)]">:{h.line}</span>
                    </div>
                    <div className="truncate font-mono text-[11px] text-[var(--color-ink-4)]">{h.text}</div>
                  </button>
                ))}
              </div>
            </SidePanel>
          )}

          {panel === "agents" && (
            <SidePanel title="Agent manager" count={fleetTotal}>
              <div className="flex-1 overflow-auto px-2 pb-3">
                {fleet.map((a) => (
                  <div key={a.id} className="mb-1 rounded-lg border border-white/10 bg-white/[0.02] p-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm" style={{ color: a.accent }}>{a.glyph}</span>
                      <span className="truncate text-[13px]">{a.name}</span>
                      <span
                        className="ml-auto h-1.5 w-1.5 rounded-full"
                        style={{ background: stateColor(a.state) }}
                        title={a.state}
                      />
                    </div>
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        onClick={() => {
                          fetch("/api/launch", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ id: a.id, action: "launch" }),
                          });
                          track("agent:launch", a.id);
                        }}
                        className="rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{ background: hexA(a.accent, 0.16), color: a.accent }}
                      >
                        {a.state === "ready" ? "Launch" : "Open"}
                      </button>
                      <span className="self-center text-[10px] text-[var(--color-ink-4)]">
                        {a.sessions > 0 ? `${a.sessions} sessions` : "standby"}
                      </span>
                    </div>
                  </div>
                ))}
                {fleet.length === 0 && (
                  <div className="px-2 py-2 text-xs text-[var(--color-ink-4)]">Polling fleet…</div>
                )}
              </div>
            </SidePanel>
          )}

          {panel === "scm" && (
            <SidePanel title="Source control · vault" count={(mem?.activity ?? []).length}>
              <div className="flex-1 overflow-auto px-2 pb-3 text-[12px]">
                {(mem?.activity ?? []).slice(0, 40).map((e, i) => (
                  <div key={i} className="border-b border-white/5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[var(--color-green)]">↻</span>
                      <span className="truncate text-[var(--color-ink-2)]">{e.agentName}</span>
                      <span className="ml-auto text-[10px] text-[var(--color-ink-4)]">{relTime(e.ts)}</span>
                    </div>
                    <div className="truncate pl-4 text-[11px] text-[var(--color-ink-4)]">{e.action}</div>
                  </div>
                ))}
                {(mem?.activity ?? []).length === 0 && (
                  <div className="px-2 py-2 text-xs text-[var(--color-ink-4)]">No vault changes yet.</div>
                )}
              </div>
            </SidePanel>
          )}
        </div>

        {/* editor + terminal */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* tab strip */}
          <div className="flex h-9 shrink-0 items-center gap-px overflow-x-auto border-b border-white/10 bg-[#080b12] text-xs">
            <Tab active={active === "welcome"} onClick={() => setActive("welcome")}>
              ⭐ Welcome
            </Tab>
            {order.map((p) => (
              <Tab key={p} active={active === p} onClick={() => setActive(p)}>
                ▤ {fileLabel(p)}
                {docs[p] && docs[p].content !== docs[p].saved && <span style={{ color: ACCENT }}> ●</span>}
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(p);
                  }}
                  className="ml-1 rounded px-1 text-[var(--color-ink-4)] hover:bg-white/10 hover:text-[var(--color-ink)]"
                >
                  ✕
                </span>
              </Tab>
            ))}
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {active === "welcome" ? (
              <Welcome
                agent={agent}
                onPanel={(p) => setPanel(p)}
                onTerminal={() => setTermOpen(true)}
                onMeeting={() => router.push("/meeting")}
                onPalette={() => setPaletteOpen(true)}
              />
            ) : activeDoc ? (
              <div className="flex h-full flex-col">
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <div
                    ref={gutterRef}
                    className="select-none overflow-hidden border-r border-white/10 px-3 py-3 text-right font-mono text-[12.5px] leading-[1.5rem] text-[var(--color-ink-4)]"
                  >
                    {Array.from({ length: lineCount }).map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    ref={editorRef}
                    value={activeDoc.content}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDocs((d) => ({ ...d, [active]: { ...d[active], content: v } }));
                      trackCursor(e.target);
                    }}
                    onKeyUp={(e) => trackCursor(e.currentTarget)}
                    onClick={(e) => trackCursor(e.currentTarget)}
                    onScroll={(e) => {
                      if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                    }}
                    wrap="off"
                    spellCheck={false}
                    className="min-h-full flex-1 resize-none overflow-auto whitespace-pre bg-transparent px-4 py-3 font-mono text-[12.5px] leading-[1.5rem] text-[var(--color-ink-2)] outline-none"
                  />
                </div>
                <div className="flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-2">
                  <button
                    onClick={save}
                    disabled={!dirty || saving}
                    className="rounded-md px-3 py-1.5 text-xs font-semibold text-[#0b0c0f] disabled:opacity-40"
                    style={{ background: ACCENT }}
                  >
                    {saving ? "Saving…" : "Save · Ctrl+S"}
                  </button>
                  <span className="font-mono text-[11px] text-[var(--color-ink-4)]">{active}</span>
                  <span className="ml-auto text-[11px] text-[var(--color-ink-4)]">
                    {toast || (dirty ? "modified" : "saved")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-sm text-[var(--color-ink-4)]">Loading…</div>
            )}
          </div>

          {/* integrated terminal — real Antigravity CLI shell + the fleet console */}
          {termOpen && (
            <div className="h-64 shrink-0 border-t border-white/10">
              <div className="flex h-8 items-center gap-1 border-b border-white/10 px-2 text-[11px] uppercase tracking-wider">
                <TermTab on={termTab === "cli"} accent={ACCENT} onClick={() => setTermTab("cli")}>
                  ▸ Antigravity CLI
                </TermTab>
                <TermTab on={termTab === "fleet"} accent={ACCENT} onClick={() => setTermTab("fleet")}>
                  ✦ Fleet
                </TermTab>
                <span className="ml-3 hidden text-[var(--color-ink-4)] sm:inline">
                  {termTab === "cli"
                    ? "live antigravity TUI · agy on PATH"
                    : "live system check + commands"}
                </span>
                <span className="ml-auto text-[var(--color-ink-4)]">
                  fleet · {readyCount}/{fleetTotal} ready
                </span>
                <button onClick={() => setTermOpen(false)} className="ml-3 text-[var(--color-ink-4)] hover:text-[var(--color-ink)]">
                  ✕
                </button>
              </div>
              {/* Both stay mounted (display toggled) so no session resets on tab switch. */}
              <div className="relative h-[calc(16rem-2rem)]">
                <div className="absolute inset-0" style={{ display: termTab === "cli" ? "block" : "none" }}>
                  <NativeTerminal session="antigravity-main" kind="antigravity" accent={ACCENT} />
                </div>
                <div className="absolute inset-0" style={{ display: termTab === "fleet" ? "block" : "none" }}>
                  <FleetTerminal prompt="antigravity" accent={ACCENT} onOpenFile={openFile} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* status bar */}
      <div
        className="flex h-6 shrink-0 items-center gap-4 px-3 text-[11px] text-[#dbe6ff]"
        style={{ background: ACCENT }}
      >
        <span>⎇ main</span>
        <span>◌ {readyCount}/{fleetTotal} ready</span>
        {sys && (
          <>
            <span title="CPU">CPU {sys.cpu.usagePct}%</span>
            <span title="Memory">MEM {sys.memory.usedPct}%</span>
          </>
        )}
        {active !== "welcome" && (
          <span>Ln {cursor.line}, Col {cursor.col}</span>
        )}
        <span className="ml-auto truncate">✦ {vaultDir}</span>
        <span>{active !== "welcome" ? "Markdown · UTF-8" : "Antigravity IDE"}</span>
      </div>

      {paletteOpen && (
        <CommandPalette
          files={files.map((f) => f.path)}
          onClose={() => setPaletteOpen(false)}
          onOpenFile={(p) => {
            setPaletteOpen(false);
            void openFile(p);
          }}
          onAction={(id) => {
            setPaletteOpen(false);
            if (id === "meeting") router.push("/meeting");
            else if (id === "terminal") setTermOpen((v) => !v);
            else if (id === "save") void save();
            else if (id === "newfile") void newFile();
            else if (id === "newfolder") void newFolder();
            else if (id === "explorer" || id === "workspace" || id === "repos" || id === "search" || id === "agents" || id === "scm" || id === "health") setPanel(id);
          }}
        />
      )}
    </div>
  );
}

function SidePanel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">{title}</span>
        <span className="text-[10px] text-[var(--color-ink-4)]">{count}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex h-full items-center gap-1.5 whitespace-nowrap border-r border-white/10 px-4 transition-colors"
      style={{
        background: active ? "#0a0d16" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-ink-4)",
        boxShadow: active ? `inset 0 -2px 0 ${ACCENT}` : "none",
      }}
    >
      {children}
    </button>
  );
}

function TermTab({
  on,
  accent,
  onClick,
  children,
}: {
  on: boolean;
  accent: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-t px-2.5 py-1 text-[10.5px] font-semibold tracking-wider transition-colors"
      style={{
        color: on ? accent : "var(--color-ink-4)",
        background: on ? hexA(accent, 0.12) : "transparent",
        boxShadow: on ? `inset 0 -2px 0 ${accent}` : "none",
      }}
    >
      {children}
    </button>
  );
}

const IDE_FEATURES = [
  { icon: "⌨", title: "Command palette", desc: "Jump to any file or action · Ctrl+K", action: "palette" },
  { icon: "▦", title: "Agent manager", desc: "Launch & monitor the fleet inline", action: "agents" },
  { icon: "⎇", title: "Source control", desc: "Watch the vault change live", action: "scm" },
  { icon: "⬇", title: "Git repos", desc: "Clone repos & dispatch agents", action: "repos" },
  { icon: "◈", title: "Self-healing + learn", desc: "Health checks, repair, usage insights", action: "health" },
  { icon: "✦", title: "Team meeting", desc: "Convene all nine agents", action: "meeting" },
  { icon: "▤", title: "Integrated terminal", desc: "Real shell · git on PATH", action: "terminal" },
  { icon: "⛶", title: "Vault explorer", desc: "Edit shared memory directly", action: "explorer" },
] as const;

function Welcome({
  agent,
  onPanel,
  onTerminal,
  onMeeting,
  onPalette,
}: {
  agent: AgentDetail;
  onPanel: (p: Panel | "workspace" | "repos" | "health") => void;
  onTerminal: () => void;
  onMeeting: () => void;
  onPalette: () => void;
}) {
  return (
    <div className="relative h-full overflow-auto">
      <AntigravityBg className="opacity-70" />
      <div className="relative mx-auto max-w-3xl px-8 py-10">
        <div className="flex items-center gap-4">
          <AntigravityMascot size={72} />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Antigravity</h1>
            <p className="text-sm text-[var(--color-ink-3)]">
              Agentic IDE · integrated terminal · fleet command from inside the editor
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {IDE_FEATURES.map((f) => (
            <button
              key={f.title}
              onClick={() => {
                if (f.action === "terminal") onTerminal();
                else if (f.action === "meeting") onMeeting();
                else if (f.action === "palette") onPalette();
                else onPanel(f.action);
              }}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg"
                style={{ background: "rgba(110,168,254,0.14)", color: ACCENT }}
              >
                {f.icon}
              </span>
              <div>
                <div className="text-sm font-medium">{f.title}</div>
                <div className="text-xs text-[var(--color-ink-4)]">{f.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">
            Open workspace in the real IDE
          </div>
          <LaunchControls
            id="antigravity"
            accent={ACCENT}
            kind="ide"
            installed={agent.status.installed}
            installCommand={agent.install?.command}
          />
        </div>
      </div>
    </div>
  );
}

const PALETTE_ACTIONS: { id: string; label: string; hint: string }[] = [
  { id: "newfile", label: "New note", hint: "create" },
  { id: "newfolder", label: "New folder", hint: "create" },
  { id: "search", label: "Search vault contents", hint: "panel" },
  { id: "meeting", label: "Open team meeting boardroom", hint: "action" },
  { id: "terminal", label: "Toggle integrated terminal", hint: "action" },
  { id: "save", label: "Save active file", hint: "Ctrl+S" },
  { id: "explorer", label: "Show Explorer", hint: "panel" },
  { id: "workspace", label: "Show Workspace", hint: "panel" },
  { id: "repos", label: "Show Repos", hint: "panel" },
  { id: "agents", label: "Show Agent manager", hint: "panel" },
  { id: "scm", label: "Show Source control", hint: "panel" },
  { id: "health", label: "Show Health & learning", hint: "panel" },
];

function CommandPalette({
  files,
  onClose,
  onOpenFile,
  onAction,
}: {
  files: string[];
  onClose: () => void;
  onOpenFile: (p: string) => void;
  onAction: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const ql = q.toLowerCase();
  const actions = PALETTE_ACTIONS.filter((a) => a.label.toLowerCase().includes(ql));
  const matchedFiles = files.filter((f) => f.toLowerCase().includes(ql)).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh]" onClick={onClose}>
      <div
        className="w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-white/15 bg-[#0c1020] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (actions.length) onAction(actions[0].id);
              else if (matchedFiles.length) onOpenFile(matchedFiles[0]);
            }
          }}
          placeholder="Type a command or file…"
          className="w-full border-b border-white/10 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-[var(--color-ink-4)]"
        />
        <div className="max-h-[50vh] overflow-auto p-1.5 text-sm">
          {actions.map((a) => (
            <button
              key={a.id}
              onClick={() => onAction(a.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/5"
            >
              <span style={{ color: ACCENT }}>⚡</span>
              <span className="flex-1">{a.label}</span>
              <span className="text-[10px] text-[var(--color-ink-4)]">{a.hint}</span>
            </button>
          ))}
          {matchedFiles.map((f) => (
            <button
              key={f}
              onClick={() => onOpenFile(f)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/5"
            >
              <span className="text-[var(--color-ink-4)]">▤</span>
              <span className="flex-1 truncate">{f}</span>
            </button>
          ))}
          {actions.length === 0 && matchedFiles.length === 0 && (
            <div className="px-3 py-3 text-xs text-[var(--color-ink-4)]">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}
