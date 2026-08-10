import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { MC_CONFIG_DIR } from "./paths";
import { logEvent } from "./logbook";
import { getFlow, runFlow } from "./flows";
import { runSelfUpdateCycle } from "./healer";
import { parseSafeCommand } from "./safe-command";

/* ------------------------------------------------------------------ *
 * A small, dependable cron engine. Jobs run a shell command every N    *
 * minutes; the scheduler ticks in-process and reloads the store each   *
 * tick so edits from the API take effect immediately. Output is        *
 * captured (truncated) so the UI can show the last run. Nothing runs   *
 * until a job is enabled.                                              *
 * ------------------------------------------------------------------ */

export interface CronJob {
  id: string;
  name: string;
  command: string;
  everyMinutes: number;
  enabled: boolean;
  createdAt: number;
  lastRun: number | null;
  lastStatus: "ok" | "error" | "running" | null;
  lastOutput: string;
}

const STORE = path.join(MC_CONFIG_DIR, "cron.json");

function ensureDir() {
  try {
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  } catch {
    /* exists */
  }
}

export function readJobs(): CronJob[] {
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8")) as CronJob[];
  } catch {
    return [];
  }
}

function writeJobs(jobs: CronJob[]) {
  ensureDir();
  fs.writeFileSync(STORE, JSON.stringify(jobs, null, 2));
}

export function addJob(input: { name: string; command: string; everyMinutes: number }): CronJob {
  const jobs = readJobs();
  const job: CronJob = {
    id: `cron_${Date.now().toString(36)}`,
    name: input.name.trim() || "Untitled job",
    command: input.command.trim(),
    everyMinutes: Math.max(1, Math.round(input.everyMinutes) || 60),
    enabled: false, // opt-in: a new job never runs until you enable it
    createdAt: Date.now(),
    lastRun: null,
    lastStatus: null,
    lastOutput: "",
  };
  jobs.push(job);
  writeJobs(jobs);
  return job;
}

export function updateJob(id: string, patch: Partial<CronJob>): CronJob | null {
  const jobs = readJobs();
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return null;
  if (typeof patch.command === "string" &&
      !patch.command.startsWith("flow:") &&
      !patch.command.startsWith("self-update:") &&
      !parseSafeCommand(patch.command.trim())) {
    return null;
  }
  jobs[i] = { ...jobs[i], ...patch, id: jobs[i].id };
  writeJobs(jobs);
  return jobs[i];
}

export function deleteJob(id: string): boolean {
  const jobs = readJobs();
  const next = jobs.filter((j) => j.id !== id);
  if (next.length === jobs.length) return false;
  writeJobs(next);
  return true;
}

/** Run one job now, capturing output. Updates the store in place. */
export function runJob(id: string): Promise<CronJob | null> {
  const jobs = readJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return Promise.resolve(null);
  updateJob(id, { lastStatus: "running", lastRun: Date.now() });

  // Handle flow: commands — run the automation flow instead of a shell command.
  if (job.command.startsWith("flow:")) {
    const flowId = job.command.slice(5);
    const flow = getFlow(flowId);
    if (!flow) {
      const updated = updateJob(id, { lastRun: Date.now(), lastStatus: "error", lastOutput: `flow not found: ${flowId}` });
      logEvent({ source: "system", level: "warn", event: `cron: ${job.name}`, detail: `flow not found: ${flowId}` });
      return Promise.resolve(updated);
    }
    return runFlow(flow).then((result) => {
      const detail = result.steps.map((s) => `${s.ok ? "✓" : "✗"} ${s.type}: ${s.detail.slice(0, 120)}`).join("\n");
      const updated = updateJob(id, { lastRun: Date.now(), lastStatus: "ok", lastOutput: detail.slice(-4000) });
      logEvent({ source: "system", level: "info", event: `cron: ${job.name}`, detail: `flow ran: ${flow.name}` });
      return updated;
    }).catch((e) => {
      const updated = updateJob(id, { lastRun: Date.now(), lastStatus: "error", lastOutput: (e as Error).message });
      logEvent({ source: "system", level: "warn", event: `cron: ${job.name}`, detail: `flow error: ${(e as Error).message}` });
      return updated;
    });
  }

  // Handle self-update: — run Hermes self-update cycle.
  if (job.command.startsWith("self-update:")) {
    const triggeredBy = (job.command.slice(12) as "cron" | "manual" | "health-check") || "cron";
    return runSelfUpdateCycle(triggeredBy).then((results) => {
      const detail = results.map((r) => `${r.status === "completed" ? "✓" : "✗"} ${r.agentId}: ${r.brief}`).join("\n");
      const updated = updateJob(id, { lastRun: Date.now(), lastStatus: "ok", lastOutput: detail.slice(-4000) });
      logEvent({ source: "system", level: "info", event: `cron: ${job.name}`, detail: `self-update cycle: ${results.length} agents checked` });
      return updated;
    }).catch((e) => {
      const updated = updateJob(id, { lastRun: Date.now(), lastStatus: "error", lastOutput: (e as Error).message });
      logEvent({ source: "system", level: "warn", event: `cron: ${job.name}`, detail: `self-update error: ${(e as Error).message}` });
      return updated;
    });
  }

  return new Promise((resolve) => {
    const parsed = parseSafeCommand(job.command);
    if (!parsed) {
      const updated = updateJob(id, { lastRun: Date.now(), lastStatus: "error", lastOutput: "rejected: shell syntax is not allowed" });
      resolve(updated);
      return;
    }
    let out = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      const updated = updateJob(id, {
        lastRun: Date.now(),
        lastStatus: error ? "error" : "ok",
        lastOutput: out.slice(-4000),
      });
      logEvent({
        source: "system",
        level: error ? "warn" : "info",
        event: `cron: ${job.name}`,
        detail: error ? `failed: ${error.message}` : "ran ok",
      });
      resolve(updated);
    };
    try {
      const child = spawn(parsed[0], parsed[1], { shell: false, windowsHide: true });
      child.stdout?.on("data", (chunk) => { out += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { out += chunk.toString(); });
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        out += "\\n— timed out —";
        finish(new Error("command timed out"));
      }, 120_000);
      child.on("error", (error) => { clearTimeout(timer); finish(error); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code && code !== 0) finish(new Error(`command exited with code ${code}`));
        else finish();
      });
    } catch (error) {
      finish(error as Error);
    }
  });
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the in-process scheduler. Idempotent. */
export function startCronScheduler() {
  if (timer) return;
  timer = setInterval(() => {
    const now = Date.now();
    for (const job of readJobs()) {
      if (!job.enabled || job.lastStatus === "running") continue;
      const due = !job.lastRun || now - job.lastRun >= job.everyMinutes * 60_000;
      if (due) void runJob(job.id);
    }
  }, 30_000);
  // Don't keep the event loop alive solely for the scheduler.
  if (typeof timer.unref === "function") timer.unref();
  logEvent({ source: "system", level: "info", event: "cron scheduler started" });
}
