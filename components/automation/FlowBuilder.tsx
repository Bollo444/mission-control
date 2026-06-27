"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

/* ------------------------------------------------------------------ *
 * ComfyUI-style automation: drag nodes onto the canvas, wire them into  *
 * if/then chains, save, and run. Triggers → conditions → actions; each  *
 * action's output flows downstream as {{input}}.                        *
 * ------------------------------------------------------------------ */

const ACCENT = "#46e0d0";

interface Pal { type: string; label: string; color: string; defaults: Record<string, unknown> }
const PALETTE: Pal[] = [
  { type: "trigger.manual", label: "▶ Manual trigger", color: "#7be0d0", defaults: {} },
  { type: "condition.if", label: "◇ If / then", color: "#f5b75a", defaults: { left: "{{input}}", op: "contains", right: "" } },
  { type: "action.agent", label: "✦ Run agent", color: "#9d8cff", defaults: { agentId: "claude", task: "{{input}}" } },
  { type: "action.shell", label: "⌘ Shell command", color: "#c0c6d4", defaults: { command: "" } },
  { type: "action.discord", label: "◈ Post to Discord", color: "#5865F2", defaults: { agentId: "claude", message: "{{input}}" } },
  { type: "action.log", label: "▸ Log message", color: "#46e0d0", defaults: { message: "flow step: {{input}}" } },
];
const palOf = (type: string) => PALETTE.find((p) => p.type === type);

const inp = "w-full rounded border bg-black/30 px-2 py-1 text-[11px] outline-none border-white/10 text-[var(--color-ink)]";

function FlowNodeView({ id, type, data }: NodeProps) {
  const { setNodes } = useReactFlow();
  const set = (patch: Record<string, unknown>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  const d = data as Record<string, unknown>;
  const pal = palOf(type);
  const isCond = type === "condition.if";
  const isTrigger = type.startsWith("trigger");
  // Per-node phase so they bob out of sync (weightless, like the jcode void).
  const seed = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  return (
    <div
      className="rounded-lg border bg-[var(--color-surface)] text-[var(--color-ink)] shadow-lg"
      style={{
        borderColor: `${pal?.color}66`,
        minWidth: 190,
        animation: `mc-node-float ${6 + (seed % 5)}s ease-in-out ${(seed % 7) * 0.4}s infinite`,
      }}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} style={{ background: pal?.color }} />}
      <div className="border-b px-2.5 py-1.5 text-[11px] font-semibold" style={{ borderColor: "rgba(255,255,255,0.08)", color: pal?.color }}>
        {pal?.label ?? type}
      </div>
      <div className="flex flex-col gap-1.5 p-2.5">
        {type === "action.agent" && (
          <>
            <input className={inp} value={String(d.agentId ?? "")} onChange={(e) => set({ agentId: e.target.value })} placeholder="agent id (e.g. claude)" />
            <textarea className={inp} rows={2} value={String(d.task ?? "")} onChange={(e) => set({ task: e.target.value })} placeholder="task — use {{input}} for upstream output" />
          </>
        )}
        {type === "action.shell" && (
          <input className={inp} value={String(d.command ?? "")} onChange={(e) => set({ command: e.target.value })} placeholder="shell command" />
        )}
        {type === "action.discord" && (
          <>
            <input className={inp} value={String(d.agentId ?? "")} onChange={(e) => set({ agentId: e.target.value })} placeholder="as agent (color)" />
            <input className={inp} value={String(d.message ?? "")} onChange={(e) => set({ message: e.target.value })} placeholder="message ({{input}})" />
          </>
        )}
        {type === "action.log" && (
          <input className={inp} value={String(d.message ?? "")} onChange={(e) => set({ message: e.target.value })} placeholder="log message ({{input}})" />
        )}
        {isCond && (
          <>
            <input className={inp} value={String(d.left ?? "")} onChange={(e) => set({ left: e.target.value })} placeholder="left ({{input}})" />
            <select className={inp} value={String(d.op ?? "contains")} onChange={(e) => set({ op: e.target.value })}>
              <option value="contains">contains</option>
              <option value="not_contains">does not contain</option>
              <option value="equals">equals</option>
              <option value="not_equals">not equals</option>
              <option value="gt">greater than</option>
              <option value="lt">less than</option>
            </select>
            <input className={inp} value={String(d.right ?? "")} onChange={(e) => set({ right: e.target.value })} placeholder="right value" />
          </>
        )}
        {isTrigger && <div className="text-[10px] text-[var(--color-ink-4)]">Runs when you press Run.</div>}
      </div>
      {isCond ? (
        <>
          <Handle type="source" id="then" position={Position.Bottom} style={{ left: "30%", background: "#3ad07a" }} />
          <Handle type="source" id="else" position={Position.Bottom} style={{ left: "70%", background: "#ff6b6b" }} />
          <div className="flex justify-between px-3 pb-1 text-[8px]"><span style={{ color: "#3ad07a" }}>then</span><span style={{ color: "#ff6b6b" }}>else</span></div>
        </>
      ) : (
        <Handle type="source" id="then" position={Position.Bottom} style={{ background: pal?.color }} />
      )}
    </div>
  );
}

const nodeTypes = Object.fromEntries(PALETTE.map((p) => [p.type, FlowNodeView]));

interface FlowMeta { id: string; name: string }

function Inner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [flowId, setFlowId] = useState(() => `flow_${Math.random().toString(36).slice(2, 9)}`);
  const [name, setName] = useState("Untitled flow");
  const [flows, setFlows] = useState<FlowMeta[]>([]);
  const [steps, setSteps] = useState<Array<{ type: string; ok: boolean; detail: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  // Natural-language driver state.
  const [nl, setNl] = useState("");
  const [driver, setDriver] = useState("claude");
  const [gen, setGen] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

  const loadList = useCallback(() => {
    fetch("/api/flows").then((r) => r.json()).then((j) => setFlows(j.flows ?? [])).catch(() => {});
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, animated: true }, es)), [setEdges]);

  const addNode = (type: string) => {
    const pal = palOf(type)!;
    setNodes((ns) => ns.concat({
      id: `${type}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      position: { x: 80 + Math.random() * 80, y: 60 + ns.length * 30 },
      data: { ...pal.defaults },
    }));
  };

  const save = async () => {
    setBusy(true);
    const flow = { id: flowId, name, nodes, edges, updatedAt: "" };
    await fetch("/api/flows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(flow) }).catch(() => {});
    setBusy(false);
    loadList();
  };

  const load = async (id: string) => {
    const j = await fetch("/api/flows").then((r) => r.json());
    const f = (j.flows ?? []).find((x: { id: string }) => x.id === id);
    if (!f) return;
    setFlowId(f.id); setName(f.name); setNodes(f.nodes ?? []); setEdges(f.edges ?? []); setSteps(null);
  };

  const newFlow = () => {
    setFlowId(`flow_${Math.random().toString(36).slice(2, 9)}`); setName("Untitled flow"); setNodes([]); setEdges([]); setSteps(null);
  };

  const run = async () => {
    setBusy(true); setSteps(null);
    const flow = { id: flowId, name, nodes, edges, updatedAt: "" };
    const j = await fetch("/api/flows/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ flow }) }).then((r) => r.json()).catch(() => null);
    setSteps(j?.steps ?? [{ type: "error", ok: false, detail: j?.error ?? "run failed" }]);
    setBusy(false);
  };

  const del = async (id: string) => {
    await fetch(`/api/flows?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    loadList();
  };

  // Describe an automation in plain language; an agent drafts the graph.
  const generate = async () => {
    const prompt = nl.trim();
    if (!prompt || gen) return;
    setGen(true); setGenErr(null);
    try {
      const r = await fetch("/api/flows/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt, agentId: driver }),
      });
      const j = await r.json();
      if (!j.ok) { setGenErr(j.error || "couldn't build that — try rephrasing"); return; }
      setFlowId(`flow_${Math.random().toString(36).slice(2, 9)}`);
      setName(j.flow.name || "Generated flow");
      setNodes(j.flow.nodes as Node[]);
      setEdges(j.flow.edges as Edge[]);
      setSteps(null);
      setNl("");
    } catch (e) {
      setGenErr((e as Error).message);
    } finally {
      setGen(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Natural-language driver — describe it, an agent wires the flow. */}
      <div className="rounded-xl border p-3" style={{ borderColor: `${ACCENT}55`, background: `${ACCENT}0d` }}>
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: ACCENT }}>
          ✦ Describe it — an agent builds the flow
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && generate()}
            placeholder="e.g. Have Claude summarize today's git commits, and log a warning if any mention a bug"
            className="min-w-0 flex-1 rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none"
          />
          <select
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
            title="which agent drives the build"
            className="rounded-lg border border-white/10 bg-[var(--color-surface-2)] px-2 py-2 text-sm text-[var(--color-ink-3)]"
          >
            {["claude", "hermes", "codex", "jcode", "opencode", "pi", "vibe"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={gen || !nl.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[#06121f] disabled:opacity-40"
            style={{ background: ACCENT }}
          >
            {gen ? "Building…" : "✨ Build it"}
          </button>
        </div>
        {genErr && <div className="mt-2 text-xs text-[#ff6b6b]">{genErr}</div>}
        <div className="mt-1.5 text-[11px] text-[var(--color-ink-4)]">
          The agent drafts the nodes onto the canvas below — review, tweak, then Save / Run. Nothing runs on its own.
        </div>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border bg-[var(--color-surface-2)] px-3 py-1.5 text-sm outline-none" placeholder="flow name" />
        <button onClick={save} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[#06121f] disabled:opacity-40" style={{ background: ACCENT }}>Save</button>
        <button onClick={run} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-40" style={{ borderColor: `${ACCENT}66`, color: ACCENT }}>{busy ? "Running…" : "▶ Run"}</button>
        <button onClick={newFlow} className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-[var(--color-ink-3)]">New</button>
        {flows.length > 0 && (
          <select onChange={(e) => e.target.value && load(e.target.value)} value="" className="rounded-lg border border-white/10 bg-[var(--color-surface-2)] px-2 py-1.5 text-sm text-[var(--color-ink-3)]">
            <option value="">Load saved…</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        )}
        <span className="text-[11px] text-[var(--color-ink-4)]">add:</span>
        {PALETTE.map((p) => (
          <button key={p.type} onClick={() => addNode(p.type)} className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ border: `1px solid ${p.color}55`, color: p.color }}>
            {p.label.split(" ").slice(1).join(" ") || p.label}
          </button>
        ))}
      </div>

      {/* canvas + run log */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border" style={{ borderColor: "var(--color-line)" }}>
          <ReactFlow
            className="mc-flow"
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        {steps && (
          <div className="w-72 shrink-0 overflow-y-auto rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-ink-4)]">Run log</div>
            {steps.length === 0 && <p className="text-xs text-[var(--color-ink-4)]">No steps ran (add a trigger).</p>}
            {steps.map((s, i) => (
              <div key={i} className="mb-2 text-[11px]">
                <div className="font-semibold" style={{ color: s.ok ? "#3ad07a" : "#ff6b6b" }}>{s.ok ? "✓" : "✗"} {s.type}</div>
                <div className="whitespace-pre-wrap break-words text-[var(--color-ink-3)]">{s.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FlowBuilder() {
  return (
    <ReactFlowProvider>
      <Inner />
    </ReactFlowProvider>
  );
}
