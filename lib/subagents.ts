import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MC_CONFIG_DIR } from "./paths";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { logEvent } from "./logbook";
import { cascadeChat } from "./gateway";
import { checkShellPermission, denyLog } from "./write-gate";

/* ------------------------------------------------------------------ *
 * Deploy a coding agent headless on a one-off task and track it. Each   *
 * run spawns the agent's CLI in print/headless mode, captures output,   *
 * and records status. Live output lives in memory; metadata persists so *
 * the list survives restarts. Real work, time-boxed and non-interactive.*
 * ------------------------------------------------------------------ */

export interface SubagentRun {
  id: string;
  agentId: string;
  agentName: string;
  task: string;
  status: "running" | "done" | "error";
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  output: string;
  /** Optional grouping tag, e.g. a Sentinel hat ("red hat") for swarm runs. */
  label?: string;
}

const STORE = path.join(MC_CONFIG_DIR, "subagents.json");
const MAX_OUTPUT = 20_000;
const RUN_TIMEOUT_MS = 5 * 60_000;

/**
 * Env for every agent-CLI spawn from this module. Cline's binary fires a
 * DETACHED `npm update -g cline --tag latest --min-release-age=0` on launch
 * (even `--version`) unless CLINE_NO_AUTO_UPDATE=1 — that detached updater
 * is what produced the 7-way npm pile-ups. Suppress it on any child spawn.
 * Harmless for non-cline agents.
 */
const AGENT_SPAWN_ENV = { ...process.env, CLINE_NO_AUTO_UPDATE: "1" };

/** Headless invocation per agent. Most coding CLIs accept `-p <prompt>`, but a
 *  few use their own non-interactive subcommand (verified this session). */
function headlessArgs(agentId: string, task: string): string[] {
  switch (agentId) {
    case "cline":
      // `cline "<task>"` — a bare positional prompt defaults to act mode with
      // auto-approve enabled (zero-interaction headless dispatch). NOT `cline run`,
      // which is an unknown subcommand. Routes through the Fleet Gateway via the
      // agent's configured openai-compatible provider.
      return [task];
    case "codex":
      return ["exec", task]; // `codex exec "<task>"`
    case "claude":
    case "hermes":
    default:
      return ["-p", task];
  }
}

function load(): SubagentRun[] {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8")) as SubagentRun[];
  } catch {
    return [];
  }
}

function save(runs: SubagentRun[]) {
  try {
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(runs.slice(-50), null, 2));
  } catch {
    /* non-fatal */
  }
}

function upsert(run: SubagentRun) {
  const runs = load();
  const i = runs.findIndex((r) => r.id === run.id);
  if (i >= 0) runs[i] = run;
  else runs.push(run);
  save(runs);
}

export function listRuns(): SubagentRun[] {
  return load().sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * Run a task through the in-process gateway (free fleet providers) and track it
 * as a SubagentRun, so the same UI/store works. Used by the Sentinel hat swarm:
 * the interactive sentinel.py can't run headless, so hats execute here instead.
 * Fire-and-forget — the run updates async; poll listRuns() for status/output.
 */
export function deployGatewayRun(opts: {
  label: string;
  system: string;
  user: string;
  agentId?: string;
  agentName?: string;
}): SubagentRun {
  const run: SubagentRun = {
    id: `sub_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
    agentId: opts.agentId ?? "gateway",
    agentName: opts.agentName ?? "Gateway",
    task: opts.user,
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    output: "",
    label: opts.label,
  };
  upsert(run);

  void (async () => {
    try {
      const res = await cascadeChat(
        {
          model: "auto",
          messages: [
            { role: "system", content: opts.system },
            { role: "user", content: opts.user },
          ],
          max_tokens: 900,
          temperature: 0.4,
        },
        { agentId: "sentinel-hat" }
      );
      if (!res.ok) {
        run.status = "error";
        run.output = `gateway error (${res.status}): ${res.error}`;
      } else {
        const j = (await res.response.json().catch(() => null)) as
          | { choices?: Array<{ message?: { content?: string } }> }
          | null;
        run.output = j?.choices?.[0]?.message?.content?.trim() || "(no content returned)";
        run.status = "done";
        run.exitCode = 0;
      }
    } catch (e) {
      run.status = "error";
      run.output = (e as Error).message;
    }
    run.endedAt = Date.now();
    upsert(run);
  })();

  return run;
}

export function deploySubagent(
  agentId: string,
  task: string,
  label?: string,
  opts?: {
    callerAgentId?: string | null;
    /** Declared DelegationTask scope — when present (proposed by hermes/user),
     *  the dispatch is explicitly scoped and may bypass the shell gate.
     *  No scope requested → the existing gate stays fail-closed. */
    scope?: { write?: boolean; vault?: boolean; gateway?: boolean; shell?: boolean };
    proposedBy?: "hermes" | "user";
  }
): { ok: boolean; run?: SubagentRun; error?: string; denied?: boolean } {
  const def = getAgent(agentId);
  if (!def) return { ok: false, error: `unknown agent: ${agentId}` };
  const bin = resolveBinary(def);
  if (!bin) return { ok: false, error: `${def.name} is not installed.` };
  if (!task.trim()) return { ok: false, error: "task is empty" };

  // Sentinel-gated shell: if a non-Sentinel agent is dispatching another
  // agent (cascade or inter-agent flow), the running CLI inherits the
  // blast radius of a shell. The user-driven UI path uses callerAgentId=null
  // and bypasses this — the human is the trust anchor for ad-hoc dispatches.
  //
  // Delegation carve-out (fail-closed): a task explicitly declares its scope
  // and was proposed by hermes/user → the declared scope IS the authorization,
  // so the dispatch is allowed. No scope declared → the gate still applies.
  if (opts?.callerAgentId) {
    const isDelegation = opts.proposedBy === "hermes" || opts.proposedBy === "user";
    const declaredScope =
      !!opts.scope &&
      (opts.scope.write === true ||
        opts.scope.vault === true ||
        opts.scope.gateway === true ||
        opts.scope.shell === true);
    if (isDelegation) {
      // Delegation carve-out (fail-closed): a task explicitly declares its scope
      // AND was proposed by hermes/user → the declared scope IS the authorization
      // and the dispatch is allowed. No scope declared → dispatch is denied
      // outright (fail-closed) per the design spec.
      if (!declaredScope) {
        logEvent({
          source: "write-gate",
          level: "warn",
          event: "denied unscoped delegation dispatch",
          detail: `${opts.proposedBy} → ${agentId}: no scope declared on delegation task — fail-closed`,
        });
        return {
          ok: false,
          error: "no scope declared on the delegation task — dispatch denied (fail-closed)",
          denied: true,
        };
      }
      logEvent({
        source: "write-gate",
        level: "info",
        event: "scoped subagent dispatch allowed",
        detail: `${opts.proposedBy} → ${agentId} · scope ${JSON.stringify(opts.scope)}`,
      });
    } else {
      const check = checkShellPermission({
        callerAgentId: opts.callerAgentId,
        command: task,
      });
      if (!check.ok) {
        logEvent({
          source: "write-gate",
          level: "warn",
          event: "denied subagent dispatch",
          detail: denyLog({
            callerAgentId: opts.callerAgentId,
            target: `<shell> ${agentId}`,
            kind: "shell",
            check,
          }),
        });
        return { ok: false, error: check.reason, denied: true };
      }
    }
  }

  const run: SubagentRun = {
    id: `sub_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4)}`,
    agentId,
    agentName: def.name,
    task: task.trim(),
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    output: "",
    label,
  };
  upsert(run);
  logEvent({ source: "background", level: "info", event: `subagent started: ${def.name}`, detail: task.slice(0, 80) });

  // Windows .cmd/.bat shims can't be spawned directly (EINVAL), and shell:true
  // mangles multi-word args (nested-quote hell), so route them through
  // `cmd.exe /c <bin> <args…>` with NO shell — Node then quotes each arg
  // correctly, keeping the task a single argument.
  const isBatch = process.platform === "win32" && /\.(cmd|bat)$/i.test(bin);

  // Sentinel's launcher is an interactive REPL: it reads the task from stdin
  // ("Describe a task"), not from a -p flag. Feed those agents via stdin.
  const STDIN_AGENTS = new Set(["sentinel"]);
  const viaStdin = STDIN_AGENTS.has(agentId);
  const rawArgs = viaStdin ? [] : headlessArgs(agentId, task.trim());
  const file = isBatch ? process.env.ComSpec || "cmd.exe" : bin;
  const args = isBatch ? ["/c", bin, ...rawArgs] : rawArgs;

  let child;
  try {
    child = spawn(file, args, {
      windowsHide: true,
      stdio: [viaStdin ? "pipe" : "ignore", "pipe", "pipe"],
      env: AGENT_SPAWN_ENV,
    });
    if (viaStdin && child.stdin) {
      child.stdin.write(task.trim() + "\n");
      child.stdin.end();
    }
  } catch (e) {
    run.status = "error";
    run.endedAt = Date.now();
    run.output = (e as Error).message;
    upsert(run);
    return { ok: false, error: (e as Error).message };
  }

  const append = (chunk: Buffer) => {
    run.output = (run.output + chunk.toString()).slice(-MAX_OUTPUT);
    upsert(run);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  let timedOut = false;
  const killTimer = setTimeout(() => {
    try {
      child.kill();
    } catch {
      /* gone */
    }
    timedOut = true;
    run.output += "\n— timed out after 5 min —";
    upsert(run);
    logEvent({
      source: "background",
      level: "warn",
      event: `subagent timed out (5 min): ${def.name}`,
      detail: task.slice(0, 80),
    });
  }, RUN_TIMEOUT_MS);

  child.on("exit", (code) => {
    clearTimeout(killTimer);
    run.status = code === 0 ? "done" : "error";
    run.endedAt = Date.now();
    run.exitCode = code;
    upsert(run);
    logEvent({
      source: "background",
      level: code === 0 ? "success" : "warn",
      event: `subagent ${code === 0 ? "finished" : timedOut ? "killed (timeout)" : "failed"}: ${def.name}`,
      detail: `exit ${code ?? "?"} · ${Math.round((run.endedAt - run.startedAt) / 1000)}s`,
    });
  });
  child.on("error", (e) => {
    clearTimeout(killTimer);
    run.status = "error";
    run.endedAt = Date.now();
    run.output += `\n${e.message}`;
    upsert(run);
    logEvent({
      source: "background",
      level: "error",
      event: `subagent spawn error: ${def.name}`,
      detail: e.message.slice(0, 120),
    });
  });

  return { ok: true, run };
}
