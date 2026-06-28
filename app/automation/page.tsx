"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentsResp } from "@/lib/types";
import { relTime } from "@/lib/format";
import FlowBuilder from "@/components/automation/FlowBuilder";

const SIGNAL = "#46e0d0";

interface CronJob {
  id: string;
  name: string;
  command: string;
  everyMinutes: number;
  enabled: boolean;
  lastRun: number | null;
  lastStatus: "ok" | "error" | "running" | null;
  lastOutput: string;
}
interface SubRun {
  id: string;
  agentId: string;
  agentName: string;
  task: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt: number | null;
  output: string;
}

const statusColor: Record<string, string> = {
  ok: "#5cd6a0",
  done: "#5cd6a0",
  error: "#f06a7a",
  running: "#f5b75a",
};

export default function AutomationPage() {
  const [tab, setTab] = useState<"flows" | "schedules" | "mcp">("flows");
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b px-8 py-6">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: SIGNAL }}>
          Scheduling · autonomy
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Automation</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-3)]">
          Build node flows (if/then chains of agents, conditions and actions), or run cron jobs and
          one-off headless sub-agents. All opt-in and logged.
        </p>
        <div className="mt-4 flex gap-2">
          {[
            { id: "flows", label: "Flow builder" },
            { id: "schedules", label: "Cron & sub-agents" },
            { id: "mcp", label: "Connectors (MCP)" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
              style={tab === t.id ? { background: `${SIGNAL}22`, color: SIGNAL, border: `1px solid ${SIGNAL}66` } : { color: "var(--color-ink-3)", border: "1px solid var(--color-line)" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "flows" ? (
        <div className="min-h-0 flex-1 overflow-hidden px-8 py-6">
          <FlowBuilder />
        </div>
      ) : tab === "schedules" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto px-8 py-7 xl:grid-cols-2">
          <CronSection />
          <SubagentSection />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-7">
          <McpSection />
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Cron ----------------------------- */

function CronSection() {
  const { data, reload } = useFetch<{ jobs: CronJob[] }>("/api/cron", 8000);
  const jobs = data?.jobs ?? [];
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [every, setEvery] = useState(60);
  const [busy, setBusy] = useState(false);

  const create = useCallback(async () => {
    if (!command.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/cron", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, command, everyMinutes: every }),
      });
      setName("");
      setCommand("");
      reload();
    } finally {
      setBusy(false);
    }
  }, [name, command, every, busy, reload]);

  const patch = useCallback(
    async (id: string, action: string, patch?: Record<string, unknown>) => {
      await fetch("/api/cron", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action, patch }),
      });
      reload();
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await fetch(`/api/cron?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      reload();
    },
    [reload]
  );

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="mc-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-3 w-1 rounded-full" style={{ background: SIGNAL }} />
          Cron jobs · {jobs.length}
        </h2>
        <div className="mt-4 flex flex-col gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Job name (e.g. nightly vault digest)"
            className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-ink-4)]"
          />
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Shell command to run"
            className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[13px] outline-none focus:border-[var(--color-ink-4)]"
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-ink-4)]">every</label>
            <input
              type="number"
              min={1}
              value={every}
              onChange={(e) => setEvery(parseInt(e.target.value, 10) || 1)}
              className="w-20 rounded-lg border bg-[var(--color-surface-2)] px-2 py-1.5 text-sm outline-none"
            />
            <span className="text-xs text-[var(--color-ink-4)]">minutes</span>
            <button
              onClick={create}
              disabled={busy || !command.trim()}
              className="ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-[#06121f] disabled:opacity-40"
              style={{ background: SIGNAL }}
            >
              {busy ? "…" : "Add job"}
            </button>
          </div>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="mc-panel-2 grid place-items-center p-8 text-sm text-[var(--color-ink-4)]">
          No cron jobs yet. Add one above — it stays paused until you enable it.
        </div>
      ) : (
        jobs.map((j) => (
          <div key={j.id} className="mc-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{j.name}</span>
                  {j.lastStatus && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                      style={{ color: statusColor[j.lastStatus] ?? "#aab1c2" }}
                    >
                      {j.lastStatus}
                    </span>
                  )}
                </div>
                <div className="mt-1 truncate font-mono text-[12px] text-[var(--color-ink-3)]">{j.command}</div>
                <div className="mt-1 text-[11px] text-[var(--color-ink-4)]">
                  every {j.everyMinutes}m · {j.lastRun ? `last ${relTime(new Date(j.lastRun).toISOString())}` : "never run"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  onClick={() => patch(j.id, "update", { enabled: !j.enabled })}
                  className="rounded-md border px-2 py-1 text-xs"
                  style={j.enabled ? { borderColor: statusColor.ok, color: statusColor.ok } : { color: "var(--color-ink-4)" }}
                  title={j.enabled ? "Enabled — running on schedule" : "Paused"}
                >
                  {j.enabled ? "● on" : "○ off"}
                </button>
                <button
                  onClick={() => patch(j.id, "run")}
                  className="rounded-md border px-2 py-1 text-xs text-[var(--color-ink-2)] hover:bg-[var(--color-surface-3)]"
                >
                  run now
                </button>
                <button
                  onClick={() => remove(j.id)}
                  className="rounded-md border px-2 py-1 text-xs text-[var(--color-rose)] hover:bg-[var(--color-surface-3)]"
                >
                  ✕
                </button>
              </div>
            </div>
            {j.lastOutput && (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-ink-3)]">
                {j.lastOutput}
              </pre>
            )}
          </div>
        ))
      )}
    </section>
  );
}

/* --------------------------- Sub-agents --------------------------- */

function SubagentSection() {
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 0);
  const { data, reload } = useFetch<{ runs: SubRun[] }>("/api/subagents", 5000);
  const runs = data?.runs ?? [];
  const installed = useMemo(
    () => (agentsData?.agents ?? []).filter((a) => a.status.installed),
    [agentsData]
  );
  const [agentId, setAgentId] = useState("");
  const [task, setTask] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!agentId && installed.length) setAgentId(installed[0].id);
  }, [installed, agentId]);

  const deploy = useCallback(async () => {
    if (!agentId || !task.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/subagents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agentId, task }),
      });
      const json = await res.json();
      if (!json.ok) setErr(json.error ?? "deploy failed");
      else setTask("");
      reload();
    } finally {
      setBusy(false);
    }
  }, [agentId, task, busy, reload]);

  return (
    <section className="flex min-h-0 flex-col gap-4">
      <div className="mc-panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="h-3 w-1 rounded-full" style={{ background: "#9d8cff" }} />
          Deploy a sub-agent
        </h2>
        <p className="mt-1 text-xs text-[var(--color-ink-4)]">
          Runs the chosen agent headless on the task (5-min cap) and captures its output.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none"
          >
            {installed.length === 0 && <option value="">No installed agents detected</option>}
            {installed.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="Task for the sub-agent…"
            rows={3}
            className="resize-none rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-ink-4)]"
          />
          {err && <div className="text-xs text-[var(--color-rose)]">{err}</div>}
          <button
            onClick={deploy}
            disabled={busy || !agentId || !task.trim()}
            className="self-end rounded-lg px-4 py-2 text-sm font-semibold text-[#0d0a18] disabled:opacity-40"
            style={{ background: "#9d8cff" }}
          >
            {busy ? "Deploying…" : "⬡ Deploy"}
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="mc-panel-2 grid place-items-center p-8 text-sm text-[var(--color-ink-4)]">
          No sub-agents deployed yet.
        </div>
      ) : (
        runs.map((r) => (
          <div key={r.id} className="mc-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{r.agentName}</span>
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                  style={{ color: statusColor[r.status] ?? "#aab1c2" }}
                >
                  {r.status}
                </span>
              </div>
              <span className="text-[11px] text-[var(--color-ink-4)]">
                {relTime(new Date(r.startedAt).toISOString())}
              </span>
            </div>
            <div className="mt-1 text-[13px] text-[var(--color-ink-2)]">{r.task}</div>
            {r.output && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--color-surface-2)] px-3 py-2 font-mono text-[11px] text-[var(--color-ink-3)]">
                {r.output}
              </pre>
            )}
          </div>
        ))
      )}
    </section>
  );
}

/* ----------------------------- MCP ------------------------------ */

function McpSection() {
  const { data, reload } = useFetch<{ servers: any[] }>("/api/mcp", 10000);
  const servers = data?.servers ?? [];
  const [showAdd, setShowAdd] = useState(false);

  const toggle = async (server: any) => {
    await fetch("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...server, enabled: !server.enabled }),
    });
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this MCP server?")) return;
    await fetch(`/api/mcp?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">MCP Connectors</h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-[#06121f]"
          style={{ background: SIGNAL }}
        >
          {showAdd ? "Close" : "Add server"}
        </button>
      </div>

      {showAdd && (
        <div className="mc-panel p-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <McpForm onDone={() => { setShowAdd(false); reload(); }} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {servers.map((s) => (
          <McpCard key={s.id} server={s} onToggle={() => toggle(s)} onRemove={() => remove(s.id)} onReload={reload} />
        ))}
      </div>
    </div>
  );
}

function McpCard({ server, onToggle, onRemove, onReload }: { server: any, onToggle: () => void, onRemove: () => void, onReload: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/mcp/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: server.id }),
      });
      const j = await res.json();
      setTestResult(j);
    } catch (e) {
      setTestResult({ ok: false, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mc-panel flex flex-col p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{server.name}</h3>
            <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--color-ink-3)] uppercase tracking-wider">
              {server.transport}
            </span>
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--color-ink-4)] truncate">
            {server.transport === "stdio" ? `${server.command} ${(server.args || []).join(" ")}` : server.url}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
           <button
            onClick={onToggle}
            className="rounded-md border px-2 py-1 text-xs font-semibold transition-colors"
            style={server.enabled ? { borderColor: statusColor.ok, color: statusColor.ok, background: `${statusColor.ok}11` } : { color: "var(--color-ink-4)", borderColor: "var(--color-line)" }}
          >
            {server.enabled ? "● enabled" : "○ disabled"}
          </button>
          <button onClick={onRemove} className="text-[var(--color-ink-4)] hover:text-[var(--color-rose)] transition-colors p-1">✕</button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={test} disabled={testing} className="text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)]">
          {testing ? "Testing..." : "Test connection"}
        </button>
        <button onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--color-ink-3)] hover:text-[var(--color-ink-1)]">
          {expanded ? "Hide tools" : `View tools (${server.tools?.length || 0})`}
        </button>
      </div>

      {(testResult || server.error) && (
        <div className={`mt-3 rounded-lg border p-3 text-[11px] font-mono ${(testResult?.ok !== false && !server.error) ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-rose-500/30 bg-rose-500/5 text-rose-400"}`}>
          {server.error && <div className="mb-1">Error: {server.error}</div>}
          {testResult && (
            <>
              {testResult.ok ? `Connection OK — ${testResult.tools?.length} tools found` : `Failed: ${testResult.error}`}
            </>
          )}
        </div>
      )}

      {expanded && server.tools && (
        <div className="mt-4 flex flex-col gap-3 border-t border-white/5 pt-4">
          {server.tools.map((t: any) => (
            <div key={t.name} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[var(--color-ink-2)]">{t.name}</span>
                {t.inputSchema?.properties && (
                   <span className="text-[9px] text-[var(--color-ink-4)]">
                     ({Object.keys(t.inputSchema.properties).length} params)
                   </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--color-ink-4)] leading-relaxed">{t.description}</p>
            </div>
          ))}
          {server.tools.length === 0 && <div className="text-xs text-[var(--color-ink-4)] italic">No tools found or server disabled.</div>}
        </div>
      )}
    </div>
  );
}

function McpForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [envStr, setEnvStr] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name || (transport === "stdio" && !command) || (transport === "http" && !url)) return;
    setBusy(true);
    try {
      const env: Record<string, string> = {};
      envStr.split("\n").forEach(line => {
        const [k, ...v] = line.split("=");
        if (k.trim()) env[k.trim()] = v.join("=").trim();
      });

      const config = {
        id: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        name,
        enabled: true,
        transport,
        command: transport === "stdio" ? command : undefined,
        args: transport === "stdio" ? args.split(" ").filter(Boolean) : undefined,
        env: transport === "stdio" ? env : undefined,
        url: transport === "http" ? url : undefined,
      };

      await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none" placeholder="e.g. My Custom Server" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">Transport</label>
          <select value={transport} onChange={(e) => setTransport(e.target.value as any)} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none">
            <option value="stdio">stdio (process)</option>
            <option value="http">http (SSE)</option>
          </select>
        </div>
      </div>

      {transport === "stdio" ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">Command</label>
            <input value={command} onChange={(e) => setCommand(e.target.value)} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none" placeholder="npx or /path/to/bin" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">Arguments</label>
            <input value={args} onChange={(e) => setArgs(e.target.value)} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none" placeholder="-y @modelcontextprotocol/server-..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">Environment Variables (KEY=VALUE, one per line)</label>
            <textarea value={envStr} onChange={(e) => setEnvStr(e.target.value)} rows={3} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none" placeholder="GITHUB_TOKEN=..." />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">URL</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none" placeholder="http://localhost:3000/sse" />
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="self-end rounded-lg px-6 py-2 text-sm font-semibold text-[#06121f]"
        style={{ background: SIGNAL }}
      >
        {busy ? "Saving..." : "Save Server"}
      </button>
    </div>
  );
}
