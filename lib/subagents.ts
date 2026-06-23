import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MC_CONFIG_DIR } from "./paths";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { logEvent } from "./logbook";

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
}

const STORE = path.join(MC_CONFIG_DIR, "subagents.json");
const MAX_OUTPUT = 20_000;
const RUN_TIMEOUT_MS = 5 * 60_000;

/** Headless invocation per agent. Most coding CLIs accept `-p <prompt>`. */
function headlessArgs(agentId: string, task: string): string[] {
  switch (agentId) {
    case "claude":
      return ["-p", task];
    case "hermes":
      return ["-p", task];
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

export function deploySubagent(agentId: string, task: string): { ok: boolean; run?: SubagentRun; error?: string } {
  const def = getAgent(agentId);
  if (!def) return { ok: false, error: `unknown agent: ${agentId}` };
  const bin = resolveBinary(def);
  if (!bin) return { ok: false, error: `${def.name} is not installed.` };
  if (!task.trim()) return { ok: false, error: "task is empty" };

  const run: SubagentRun = {
    id: `sub_${Date.now().toString(36)}`,
    agentId,
    agentName: def.name,
    task: task.trim(),
    status: "running",
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    output: "",
  };
  upsert(run);
  logEvent({ source: "system", level: "info", event: `subagent deployed: ${def.name}`, detail: task.slice(0, 80) });

  let child;
  try {
    child = spawn(bin, headlessArgs(agentId, task.trim()), {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
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

  const killTimer = setTimeout(() => {
    try {
      child.kill();
    } catch {
      /* gone */
    }
    run.output += "\n— timed out after 5 min —";
  }, RUN_TIMEOUT_MS);

  child.on("exit", (code) => {
    clearTimeout(killTimer);
    run.status = code === 0 ? "done" : "error";
    run.endedAt = Date.now();
    run.exitCode = code;
    upsert(run);
    logEvent({
      source: "system",
      level: code === 0 ? "success" : "warn",
      event: `subagent ${code === 0 ? "finished" : "failed"}: ${def.name}`,
    });
  });
  child.on("error", (e) => {
    clearTimeout(killTimer);
    run.status = "error";
    run.endedAt = Date.now();
    run.output += `\n${e.message}`;
    upsert(run);
  });

  return { ok: true, run };
}
