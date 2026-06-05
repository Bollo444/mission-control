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
import WindowControls from "./WindowControls";
import LaunchControls from "@/components/LaunchControls";

const ACCENT = "#6ea8fe";

type Panel = "explorer" | "search" | "agents" | "scm";

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
  { id: "search", icon: "⌕", label: "Search vault contents" },
  { id: "agents", icon: "▦", label: "Agent manager" },
  { id: "scm", icon: "⎇", label: "Source control · activity" },
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
          onClick={() => setPaletteOpen(true)}
          className="ml-auto mr-2 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-[var(--color-ink-4)] hover:bg-white/5"
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
                onClick={() => setPanel(it.id as Panel)}
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
                        onClick={() =>
                          fetch("/api/launch", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ id: a.id, action: "launch" }),
                          })
                        }
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

          {/* integrated terminal */}
          {termOpen && (
            <div className="h-64 shrink-0 border-t border-white/10">
              <div className="flex h-8 items-center gap-4 border-b border-white/10 px-4 text-[11px] uppercase tracking-wider">
                <span style={{ color: ACCENT }}>● Terminal</span>
                <span className="text-[var(--color-ink-4)]">live system check + commands</span>
                <span className="ml-auto text-[var(--color-ink-4)]">
                  fleet · {readyCount}/{fleetTotal} ready
                </span>
                <button onClick={() => setTermOpen(false)} className="text-[var(--color-ink-4)] hover:text-[var(--color-ink)]">
                  ✕
                </button>
              </div>
              <div className="h-[calc(16rem-2rem)]">
                <FleetTerminal prompt="antigravity" accent={ACCENT} onOpenFile={openFile} />
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
            else if (id === "explorer" || id === "search" || id === "agents" || id === "scm") setPanel(id);
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

const IDE_FEATURES: { icon: string; title: string; desc: string; action: "explorer" | "agents" | "scm" | "terminal" | "meeting" | "palette" }[] = [
  { icon: "⌨", title: "Command palette", desc: "Jump to any file or action · Ctrl+K", action: "palette" },
  { icon: "▦", title: "Agent manager", desc: "Launch & monitor the fleet inline", action: "agents" },
  { icon: "⎇", title: "Source control", desc: "Watch the vault change live", action: "scm" },
  { icon: "✦", title: "Team meeting", desc: "Convene all nine agents", action: "meeting" },
  { icon: "▤", title: "Integrated terminal", desc: "Real system check + commands", action: "terminal" },
  { icon: "⛶", title: "Vault explorer", desc: "Edit shared memory directly", action: "explorer" },
];

function Welcome({
  agent,
  onPanel,
  onTerminal,
  onMeeting,
  onPalette,
}: {
  agent: AgentDetail;
  onPanel: (p: Panel) => void;
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
  { id: "agents", label: "Show Agent manager", hint: "panel" },
  { id: "scm", label: "Show Source control", hint: "panel" },
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
