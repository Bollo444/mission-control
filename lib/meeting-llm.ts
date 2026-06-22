import { getAgent } from "./registry";
import { getAgentBehavior } from "./memory";
import { readSettings } from "./settings";
import { cascadeChat } from "./gateway";
import { logEvent } from "./logbook";
import type { SystemReport } from "./types";

/*
  Per-agent live-LLM meeting turns. Each agent speaks through cascadeChat() on
  its routed model, with its persona (role + lens + specialty) as the system
  prompt and the live fleet metrics as context. Falls back to null on any
  failure so the meeting engine can substitute a templated line — the meeting
  must never 503 the dashboard because a provider blipped.
*/

type AnyObj = Record<string, unknown>;

export interface TurnCtx {
  report: SystemReport;
  phase: "open" | "reply" | "close";
  /** Human label of the current thread, if any (e.g. "provisioning", "disk pressure"). */
  topic?: string;
  /** Recent lines already said in this thread (so agents reply to each other). */
  priorTurns?: string[];
  /** Set when replying to a user-typed message in the boardroom. */
  userMessage?: string;
}

/** Build the system prompt that defines an agent's voice + lens + directive. */
function personaPrompt(agentId: string): string {
  const a = getAgent(agentId);
  const beh = getAgentBehavior(agentId);
  const name = a?.name ?? agentId;
  const role = beh.role ?? a?.tagline ?? "Agent";
  const lens = beh.lens ?? "your specialty";
  const lines = [
    `You are ${name}, the ${role} in a team of AI coding agents (the "Mission Control" fleet).`,
    `Your lens: ${lens}. Speak only to what you genuinely own.`,
    "Rules: 1-3 sentences. Conversational, first person, in character. Cite real numbers from the context when relevant.",
    "If replying, address other agents by name. No markdown, no headers, no bullet lists — just speech.",
  ];
  // An agent's vault directive (if set) is the strongest signal of its current intent.
  if (beh.directive && beh.directive.trim()) {
    lines.push(`Your current directive: ${beh.directive.trim()}`);
  }
  return lines.join(" ");
}

/** Render the live fleet metrics as compact context the model can cite. */
function metricsBlock(report: SystemReport): string {
  const f = report.fleet;
  const agents = f.agents.map((x) => `${x.name}=${x.state}`).join(", ");
  return [
    `FLEET: ${f.ready}/${f.total} live · ${f.config} config · ${f.offline} offline · ${f.sessions} sessions.`,
    `Agents: ${agents}`,
    `HOST: CPU ${report.cpu.usagePct}% · mem ${report.memory.usedPct}%` +
      (report.disk ? ` · disk ${report.disk.usedPct}%` : "") +
      ` · ${report.cpu.cores} cores.`,
    `VAULT: ${report.vault.agentNotes} notes · ${report.vault.activityEntries} activity entries` +
      (report.vault.lastActivity ? ` · last ${report.vault.lastActivity}` : " · no activity yet") +
      ".",
  ].join("\n");
}

/**
 * Generate one agent turn via cascadeChat on the agent's routed model.
 * Returns the spoken text, or null if the call failed (caller falls back).
 */
export async function llmTurn(agentId: string, ctx: TurnCtx): Promise<string | null> {
  const settings = readSettings();
  const route = settings.routingPreferred[agentId] ?? settings.routing[agentId];
  if (!route) return null;

  const userParts: string[] = [];
  if (ctx.phase === "open") {
    userParts.push("Open the meeting: frame the agenda from the live state in 1-2 sentences.");
  } else if (ctx.phase === "close") {
    userParts.push("Close the meeting: land the decision crisply in 1-2 sentences. Summarize, don't re-run.");
  } else {
    if (ctx.userMessage) userParts.push(`The user said: "${ctx.userMessage}". Respond in character.`);
    if (ctx.topic) userParts.push(`Current thread: ${ctx.topic}.`);
    if (ctx.priorTurns && ctx.priorTurns.length) {
      userParts.push(
        "Recent lines in this thread:\n" + ctx.priorTurns.map((t) => `- ${t}`).join("\n")
      );
      userParts.push("Reply to these — address the last speaker by name.");
    }
  }
  userParts.push("\nLIVE CONTEXT:\n" + metricsBlock(ctx.report));

  const body = {
    // cascadeChat resolves provider/model from a "provider/model" string,
    // else from the per-agent preferred route. We send the slot's route so the
    // agent's configured model is the one that runs.
    model: `${route.provider}/${route.model}`,
    messages: [
      { role: "system", content: personaPrompt(agentId) },
      { role: "user", content: userParts.join("\n\n") },
    ],
    max_tokens: 220,
    temperature: 0.8,
    stream: false,
  };

  const result = await cascadeChat(body as AnyObj, { agentId });
  if (!result.ok) {
    logEvent({
      source: "meeting",
      level: "warn",
      event: "llm turn failed",
      detail: `${agentId}: ${result.error}`,
      meta: { agentId },
    });
    return null;
  }
  const text = await result.response.text().catch(() => "");
  try {
    const json = JSON.parse(text) as AnyObj;
    const choices = Array.isArray(json.choices) ? (json.choices as AnyObj[]) : [];
    const msg = (choices[0]?.message ?? {}) as AnyObj;
    const out = msg?.content?.toString().trim();
    return out && out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
