import { NextResponse } from "next/server";
import { cascadeChat } from "@/lib/gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Natural-language automation driver. You describe what you want; an agent
 * (routed through the Fleet Gateway) emits a flow graph that the builder loads
 * onto the canvas for review. Nothing runs automatically — the flow uses a
 * manual trigger and you press Run.
 */

const NODE_TYPES = [
  "trigger.manual",
  "trigger.cron",
  "trigger.meeting",
  "condition.if",
  "action.agent",
  "action.shell",
  "action.discord",
  "action.log",
  "action.mcp",
] as const;

const DEFAULTS: Record<string, Record<string, unknown>> = {
  "trigger.manual": {},
  "trigger.cron": { everyMinutes: 60 },
  "trigger.meeting": {},
  "condition.if": { left: "{{input}}", op: "contains", right: "" },
  "action.agent": { agentId: "claude", task: "{{input}}" },
  "action.shell": { command: "" },
  "action.discord": { agentId: "claude", message: "{{input}}" },
  "action.log": { message: "flow step: {{input}}" },
  "action.mcp": { server: "", tool: "", args: "{}" },
};

const SYSTEM = `You are the automation architect for "Mission Control", a fleet of coding agents.
Turn the user's request into a flow GRAPH and reply with ONLY a JSON object — no prose, no markdown fences.

Shape:
{"name": string, "nodes": [{"id": string, "type": string, "data": object}], "edges": [{"source": id, "target": id, "sourceHandle"?: "then"|"else"}]}

Node types and their data:
- "trigger.manual"    data: {}                                  // every flow starts with exactly one trigger
- "trigger.cron"      data: {"everyMinutes": number}             // re-runs this flow on a schedule
- "trigger.meeting"   data: {}                                  // triggers a team meeting convene
- "action.agent"      data: {"agentId": string, "task": string} // ask an agent; agentId ∈ claude,hermes,codex,pi,cline,jcode,vibe,openclaw,sentinel
- "action.shell"      data: {"command": string}                 // a shell command (Windows). Use ONLY if the user asks for a system/script action.
- "action.discord"    data: {"agentId": string, "message": string}
- "action.log"        data: {"message": string}
- "action.mcp"        data: {"server": string, "tool": string, "args": string} // call an MCP server tool (args is JSON string)
- "condition.if"      data: {"left": string, "op": "contains"|"not_contains"|"equals"|"not_equals"|"gt"|"lt", "right": string}
                      // branch with two edges from it: sourceHandle "then" and "else"

Rules:
- Each action's output flows downstream as the literal token {{input}}; reference it in later tasks/messages.
- Start with exactly one trigger (manual, cron, or meeting), then wire nodes with edges (source → target). Keep it minimal but complete.
- Prefer action.agent and action.log. Use action.shell only when clearly asked. Use condition.if only when the request branches.
- Use trigger.cron when the user wants something recurring. Use trigger.meeting when the user wants a fleet discussion.
- Give every node a short unique id. Output valid JSON only.

Example — "every run, have claude summarize the latest git commits, and if it mentions a bug, log a warning":
{"name":"Commit summary + bug watch","nodes":[
 {"id":"t1","type":"trigger.manual","data":{}},
 {"id":"a1","type":"action.agent","data":{"agentId":"claude","task":"Summarize the latest git commits in this repo."}},
 {"id":"c1","type":"condition.if","data":{"left":"{{input}}","op":"contains","right":"bug"}},
 {"id":"l1","type":"action.log","data":{"message":"⚠ Possible bug in recent commits: {{input}}"}}],
 "edges":[{"source":"t1","target":"a1"},{"source":"a1","target":"c1"},{"source":"c1","target":"l1","sourceHandle":"then"}]}`;

interface RawNode { id?: string; type?: string; data?: Record<string, unknown> }
interface RawEdge { source?: string; target?: string; sourceHandle?: string }

function extractJson(text: string): unknown {
  // tolerate stray prose/fences — grab the outermost { … }.
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object in reply");
  return JSON.parse(text.slice(a, b + 1));
}

export async function POST(req: Request) {
  let body: { prompt?: string; agentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const prompt = (body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ ok: false, error: "describe what the automation should do" }, { status: 400 });
  const driver = body.agentId || "claude";

  const res = await cascadeChat(
    {
      model: "auto",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
      max_tokens: 1200,
      temperature: 0.2,
    },
    { agentId: driver },
  );
  if (!res.ok) return NextResponse.json({ ok: false, error: `gateway: ${res.error}` }, { status: 502 });

  const j = (await res.response.json().catch(() => null)) as
    | { choices?: Array<{ message?: { content?: string } }> }
    | null;
  const content = j?.choices?.[0]?.message?.content?.trim() || "";

  let parsed: { name?: string; nodes?: RawNode[]; edges?: RawEdge[] };
  try {
    parsed = extractJson(content) as typeof parsed;
  } catch (e) {
    return NextResponse.json({ ok: false, error: `couldn't parse the agent's reply: ${(e as Error).message}`, raw: content.slice(0, 500) }, { status: 422 });
  }

  // --- sanitize into a real, runnable flow ---
  const rawNodes = Array.isArray(parsed.nodes) ? parsed.nodes.slice(0, 24) : [];
  const idMap = new Map<string, string>();
  const nodes = rawNodes
    .filter((n) => n.type && (NODE_TYPES as readonly string[]).includes(n.type))
    .map((n, i) => {
      const id = n.id && !idMap.has(n.id) ? n.id : `${n.type!.replace(/\W/g, "_")}_${i}`;
      if (n.id) idMap.set(n.id, id);
      return {
        id,
        type: n.type as string,
        position: { x: 250, y: 40 + i * 130 }, // tidy vertical layout; drag to taste
        data: { ...DEFAULTS[n.type as string], ...(n.data ?? {}) },
      };
    });

  if (!nodes.length) return NextResponse.json({ ok: false, error: "the agent didn't produce any nodes — try rephrasing", raw: content.slice(0, 500) }, { status: 422 });

  // Guarantee a starting trigger.
  if (!nodes.some((n) => n.type.startsWith("trigger"))) {
    nodes.unshift({ id: "trigger_auto", type: "trigger.manual", position: { x: 250, y: 40 }, data: {} });
    nodes.forEach((n, i) => (n.position = { x: 250, y: 40 + i * 130 }));
  }

  const valid = new Set(nodes.map((n) => n.id));
  const remap = (s?: string) => (s && idMap.get(s)) || s;
  const edges = (Array.isArray(parsed.edges) ? parsed.edges : [])
    .map((e, i) => ({
      id: `e_${i}`,
      source: remap(e.source) as string,
      target: remap(e.target) as string,
      sourceHandle: e.sourceHandle === "else" || e.sourceHandle === "then" ? e.sourceHandle : undefined,
      animated: true,
    }))
    .filter((e) => valid.has(e.source) && valid.has(e.target));

  const name = (parsed.name || prompt.slice(0, 48)).toString().slice(0, 80);
  return NextResponse.json({ ok: true, flow: { name, nodes, edges } });
}
