import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MC_CONFIG_DIR } from "./paths";
import { cascadeChat } from "./gateway";
import { logEvent } from "./logbook";

/* ------------------------------------------------------------------ *
 * Automation flows — a ComfyUI-style node graph. Triggers feed into     *
 * conditions (if/then) and actions, chained by edges. The executor      *
 * walks from each trigger, following edges; conditions branch via their *
 * "then"/"else" output handles. The output of each action passes down   *
 * the chain as {{input}}.                                               *
 * ------------------------------------------------------------------ */

export interface FlowNode {
  id: string;
  type: string; // trigger.manual | condition.if | action.agent | action.shell | action.discord | action.log
  data: Record<string, unknown>;
  position: { x: number; y: number };
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}
export interface Flow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  updatedAt: string;
}

const STORE = path.join(MC_CONFIG_DIR, "flows.json");

export function listFlows(): Flow[] {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8")) as Flow[];
  } catch {
    return [];
  }
}

export function getFlow(id: string): Flow | undefined {
  return listFlows().find((f) => f.id === id);
}

export function saveFlow(flow: Flow): Flow {
  const flows = listFlows();
  flow.updatedAt = new Date().toISOString();
  const i = flows.findIndex((f) => f.id === flow.id);
  if (i >= 0) flows[i] = flow;
  else flows.push(flow);
  fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(STORE, JSON.stringify(flows, null, 2), "utf8");
  return flow;
}

export function deleteFlow(id: string): void {
  const flows = listFlows().filter((f) => f.id !== id);
  try {
    fs.writeFileSync(STORE, JSON.stringify(flows, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

export interface StepLog {
  nodeId: string;
  type: string;
  ok: boolean;
  detail: string;
}

function subst(template: string, input: string): string {
  return String(template ?? "").replace(/\{\{\s*input\s*\}\}/g, input);
}

function evalCondition(data: Record<string, unknown>, input: string): boolean {
  const left = subst(String(data.left ?? "{{input}}"), input);
  const right = String(data.right ?? "");
  switch (String(data.op ?? "contains")) {
    case "contains": return left.toLowerCase().includes(right.toLowerCase());
    case "not_contains": return !left.toLowerCase().includes(right.toLowerCase());
    case "equals": return left === right;
    case "not_equals": return left !== right;
    case "gt": return Number(left) > Number(right);
    case "lt": return Number(left) < Number(right);
    default: return false;
  }
}

async function runAgentTask(agentId: string, task: string): Promise<string> {
  const res = await cascadeChat(
    { model: "auto", messages: [{ role: "user", content: task }], max_tokens: 700 },
    { agentId }
  );
  if (!res.ok) return `⚠ gateway error: ${res.error}`;
  const j = (await res.response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  return j?.choices?.[0]?.message?.content?.trim() || "(no reply)";
}

function runShell(command: string): Promise<string> {
  return new Promise((resolve) => {
    let out = "";
    try {
      const child = spawn(command, { shell: true, windowsHide: true });
      child.stdout?.on("data", (c) => (out += c.toString()));
      child.stderr?.on("data", (c) => (out += c.toString()));
      const t = setTimeout(() => { try { child.kill(); } catch {} resolve(out.slice(-4000) + "\n— timed out —"); }, 60_000);
      child.on("exit", () => { clearTimeout(t); resolve(out.slice(-4000) || "(no output)"); });
      child.on("error", (e) => { clearTimeout(t); resolve(`error: ${e.message}`); });
    } catch (e) {
      resolve(`error: ${(e as Error).message}`);
    }
  });
}

/** Execute a flow: walk from each trigger, following edges; conditions branch. */
export async function runFlow(flow: Flow): Promise<{ steps: StepLog[] }> {
  const steps: StepLog[] = [];
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const visited = new Set<string>();
  let input = ""; // last action output, threaded down the chain as {{input}}

  const walk = async (nodeId: string): Promise<void> => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = byId.get(nodeId);
    if (!node) return;
    let branch: string | null = null;

    try {
      if (node.type === "action.agent") {
        const out = await runAgentTask(String(node.data.agentId || "claude"), subst(String(node.data.task || "{{input}}"), input));
        input = out;
        steps.push({ nodeId, type: node.type, ok: true, detail: out.slice(0, 400) });
      } else if (node.type === "action.shell") {
        const out = await runShell(subst(String(node.data.command || ""), input));
        input = out;
        steps.push({ nodeId, type: node.type, ok: true, detail: out.slice(0, 400) });
      } else if (node.type === "action.discord") {
        const { postAsAgent } = await import("./discord");
        const msg = subst(String(node.data.message || "{{input}}"), input);
        const sent = await postAsAgent(String(node.data.agentId || "claude"), msg);
        steps.push({ nodeId, type: node.type, ok: sent, detail: sent ? "posted to Discord" : "bot not connected" });
      } else if (node.type === "action.log") {
        logEvent({ source: "system", level: "info", event: subst(String(node.data.message || "flow step"), input).slice(0, 200) });
        steps.push({ nodeId, type: node.type, ok: true, detail: "logged" });
      } else if (node.type === "condition.if") {
        const pass = evalCondition(node.data, input);
        branch = pass ? "then" : "else";
        steps.push({ nodeId, type: node.type, ok: true, detail: `→ ${branch}` });
      } else {
        steps.push({ nodeId, type: node.type, ok: true, detail: "trigger" });
      }
    } catch (e) {
      steps.push({ nodeId, type: node.type, ok: false, detail: (e as Error).message });
      return;
    }

    const next = flow.edges.filter(
      (e) => e.source === nodeId && (branch === null || (e.sourceHandle ?? "then") === branch)
    );
    for (const e of next) await walk(e.target);
  };

  const triggers = flow.nodes.filter((n) => n.type.startsWith("trigger"));
  const starts = triggers.length ? triggers : flow.nodes.filter((n) => !flow.edges.some((e) => e.target === n.id));
  for (const s of starts) await walk(s.id);
  return { steps };
}
