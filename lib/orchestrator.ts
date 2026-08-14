import {
  getTask,
  createTask,
  transitionTask,
  updateRun,
  setReport,
  patchTask,
  type NewTaskInput,
} from "./taskStore";
import { deploySubagent, listRuns } from "./subagents";
import { cascadeChat } from "./gateway";
import { readSettings } from "./settings";
import { appendActivity } from "./memory";
import { getAgent } from "./registry";
import type { DelegationTask } from "./DelegationTask";

/*
  Hermes delegation loop — the two-hop orchestration flow.

  Hop 0  proposeTask   — Hermes/UI creates a contract, lands `proposed`.
  Hop 1  decideTask    — the TARGET's routed model reviews the contract and
                         accepts or declines (agent-decided). Accept → `running`;
                         decline → `declined` with the stored reason; an LLM
                         failure leaves the task `proposed` with `accept_error`.
  Hop 2  dispatchRun   — on accept, deploySubagent launches the real headless
                         run; the subagents.json run id is linked into task.run.
  Hop 3  reportBack    — on run completion, the target's model summarizes the
                         REAL run output into report.text; task → `done`.

  reconcileRun syncs a `running` task against subagents.json so a crash or
  `pm2 reload` mid-run resumes on the next poll instead of hanging forever.
  Every state, reason, and error stored here is real model text or real process
  output — nothing is simulated.
*/

/* ------------------------------------------------------------------ */
/* LLM plumbing (routed through the existing cascadeChat gateway)      */
/* ------------------------------------------------------------------ */

function routeFor(agentId: string) {
  const settings = readSettings();
  return settings.routingPreferred[agentId] ?? settings.routing[agentId] ?? null;
}

/** Run one real LLM turn against the target's routed model; returns raw text or null. */
async function llmTurnRaw(agentId: string, system: string, user: string): Promise<string | null> {
  const route = routeFor(agentId);
  if (!route) return null;
  const res = await cascadeChat(
    {
      model: `${route.provider}/${route.model}`,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 320,
      temperature: 0.2,
      stream: false,
    },
    { agentId }
  );
  if (!res.ok) return null;
  const text = await res.response.text().catch(() => "");
  try {
    const json = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch {
    return null;
  }
}

/** Parse a strict-JSON answer out of a model turn. Lenient: scans for a
 *  brace-balanced {...} block (so nested braces in a reason can't truncate it). */
function parseJsonAnswer(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* fall through to scanning */
  }
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (c === "\\") { escaped = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Hop 0 — contract creation                                           */
/* ------------------------------------------------------------------ */

export async function proposeTask(input: NewTaskInput): Promise<DelegationTask> {
  const task = await createTask({ ...input, state: "proposed" });
  // Feed the hub — every delegation shows up in the shared vault/orb activity
  // so the whole fleet (and Hermes) can see what's been handed off.
  const targetName = getAgent(task.target)?.name ?? task.target;
  try {
    appendActivity({
      agentId: task.proposedBy === "hermes" ? "hermes" : task.target,
      agentName: task.proposedBy === "hermes" ? "Hermes" : targetName,
      action: task.proposedBy === "hermes"
        ? `delegated a task to ${targetName}`
        : `received a delegated task from the hub`,
      detail: task.summary,
    });
  } catch {
    /* activity logging must never break the delegation loop */
  }
  return task;
}

/* ------------------------------------------------------------------ */
/* Hop 1 — the target decides (agent-decided)                          */
/* ------------------------------------------------------------------ */

export interface DecideResult {
  decision: "accept" | "decline" | "error";
  reason?: string;
  error?: string;
  /** True when the task was accepted but the hub dispatch was scope-denied
   *  (fail-closed). The task stays `running` with scope_error set — distinct
   *  from an acceptance-LLM failure, which leaves the task `proposed`. */
  denied?: boolean;
}

const ACCEPT_SYSTEM =
  "You are the acceptance reviewer for a delegated task. You decide, on your " +
  "own authority, whether to take the job. Be honest: only accept what you can " +
  "actually do. Reply with STRICT JSON only, no markdown: " +
  '{"decision":"accept"|"decline","reason":"<one sentence>"}';

export async function decideTask(taskId: string): Promise<DecideResult> {
  const task = await getTask(taskId);
  if (!task) return { decision: "error", error: `Task ${taskId} not found` };
  if (task.state !== "proposed") {
    return { decision: "error", error: `Task ${taskId} is not in proposed state (${task.state})` };
  }

  const user = [
    `Delegation contract for ${task.target}:`,
    `- summary: ${task.summary}`,
    `- task: ${task.task}`,
    task.successCriteria ? `- success criteria: ${task.successCriteria}` : null,
    task.context ? `- context: ${task.context}` : null,
    `- declared scope: ${JSON.stringify(task.scope)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await llmTurnRaw(task.target, ACCEPT_SYSTEM, user);
  const parsed = raw ? parseJsonAnswer(raw) : null;
  const decision = parsed?.decision;
  const reason = typeof parsed?.reason === "string" ? parsed.reason : undefined;

  if (decision === "decline") {
    await transitionTask(taskId, "declined", { declineReason: reason ?? "" });
    return { decision: "decline", reason };
  }
  if (decision !== "accept") {
    const detail = raw ? "acceptance LLM returned an unparseable decision" : "acceptance LLM failed or no route configured";
    await patchTask(taskId, { accept_error: detail });
    return { decision: "error", error: detail };
  }

  await transitionTask(taskId, "running", { acceptReason: reason ?? "" });
  const dispatched = await dispatchRun(taskId);
  if (!dispatched.ok) {
    return { decision: "error", error: dispatched.error, denied: dispatched.denied };
  }
  return { decision: "accept", reason };
}

/* ------------------------------------------------------------------ */
/* Hop 2 — hub dispatch (real headless run via deploySubagent)         */
/* ------------------------------------------------------------------ */

export async function dispatchRun(
  taskId: string
): Promise<{ ok: boolean; error?: string; denied?: boolean }> {
  const task = await getTask(taskId);
  if (!task) return { ok: false, error: `Task ${taskId} not found` };
  if (task.state !== "running") {
    return { ok: false, error: `Task ${taskId} is not in running state (${task.state})` };
  }

  const res = deploySubagent(task.target, task.task, `delegation-${taskId}`, {
    callerAgentId: "hermes",
    scope: task.scope,
    proposedBy: task.proposedBy,
  });
  if (!res.ok || !res.run) {
    const err = res.error ?? "dispatch failed";
    if (res.denied) {
      // Scope violation — fail-closed: the task stays put with scope_error set.
      await patchTask(taskId, { scope_error: err });
      return { ok: false, error: err, denied: true };
    }
    await transitionTask(taskId, "error", { run_error: err });
    return { ok: false, error: err };
  }
  await updateRun(taskId, {
    id: res.run.id,
    status: "running",
    startedAt: new Date(res.run.startedAt).toISOString(),
    exitCode: null,
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Hop 3 — report-back (real summary of the real run output)           */
/* ------------------------------------------------------------------ */

export async function reportBack(taskId: string): Promise<DelegationTask | null> {
  const task = await getTask(taskId);
  if (!task) return null;
  if (task.state !== "running") return task;

  const output = task.run?.output?.trim() ?? "";
  let text: string;
  if (!output) {
    text = "(run produced no output)";
  } else {
    const summary = await llmTurnRaw(
      task.target,
      `You are ${task.target}, reporting back to Hermes after a delegated run. ` +
        "Summarize the REAL output below in 2-4 plain sentences: what happened, " +
        "the result, any caveats. No JSON, no markdown headers.",
      `Delegated task: ${task.summary}\n\nReal run output:\n${output.slice(0, 6000)}`
    );
    text = summary?.trim() || "(report couldn't be generated — run output attached)";
  }

  await setReport(taskId, { text, generatedAt: new Date().toISOString() });
  await transitionTask(taskId, "done");
  // Report-back lands in the shared activity feed too — the loop is visible end to end.
  try {
    const targetName = getAgent(task.target)?.name ?? task.target;
    appendActivity({
      agentId: task.target,
      agentName: targetName,
      action: "completed a delegated task",
      detail: task.summary,
    });
  } catch {
    /* ignore */
  }
  return getTask(taskId);
}

/* ------------------------------------------------------------------ */
/* Reconcile — sync a running task against subagents.json (crash-safe) */
/* ------------------------------------------------------------------ */

export async function reconcileRun(taskId: string): Promise<DelegationTask | null> {
  const task = await getTask(taskId);
  if (!task || !task.run) return task;
  const live = listRuns().find((r) => r.id === task.run?.id);
  if (!live) return task; // not yet persisted, or store pruned — keep as-is

  await updateRun(taskId, {
    id: live.id,
    status: live.status,
    output: live.output,
    exitCode: live.exitCode,
    startedAt: new Date(live.startedAt).toISOString(),
    endedAt: live.endedAt ? new Date(live.endedAt).toISOString() : task.run.endedAt,
  });

  if (live.status === "done") {
    return reportBack(taskId);
  }
  if (live.status === "error") {
    await transitionTask(taskId, "error", {
      run_error: live.output.slice(0, 400) || "run failed",
    });
  }
  return getTask(taskId);
}
