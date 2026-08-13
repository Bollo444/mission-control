import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { VAULT_DIR, MC_CONFIG_DIR, MC_SETTINGS_FILE, REPO_WORKSPACE_DIR } from "./paths";
import { logEvent } from "./logbook";

export interface HealthCheck {
  name: string;
  ok: boolean;
  detail: string;
  fixable: boolean;
}

export interface HealthReport {
  ts: string;
  checks: HealthCheck[];
  allOk: boolean;
}

export interface RepairAction {
  action: string;
  ok: boolean;
  detail: string;
}

interface Pm2Proc {
  name: string;
  pid: number;
  status: string;
  uptime: number;
}

/** Resolve PM2's CLI entry-point so we can invoke it via execFile. */
let _pm2Cli: string | null = null;
function pm2CliPath(): string {
  if (_pm2Cli) return _pm2Cli;
  const pm2Dir = path.join(process.cwd(), "node_modules", "pm2");
  _pm2Cli = path.join(pm2Dir, "bin", "pm2");
  return _pm2Cli;
}

function pm2Exec(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [pm2CliPath(), ...args],
      { timeout: 8000, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      }
    );
  });
}

async function listPm2Processes(): Promise<Pm2Proc[]> {
  try {
    let raw = await pm2Exec(["jlist"]);
    raw = raw.replace(/\u001b\[[\d;]*[a-zA-Z]/g, "");
    const jsonStart = raw.search(/\[(?=\{|])/);
    if (jsonStart === -1) return [];
    const list = JSON.parse(raw.slice(jsonStart)) as Array<{
      name: string;
      pid: number;
      pm2_env: { status: string; pm_uptime: number };
    }>;
    return list.map((p) => ({
      name: p.name,
      pid: p.pid || 0,
      status: p.pm2_env.status,
      uptime: p.pm2_env.pm_uptime ? Date.now() - p.pm2_env.pm_uptime : 0,
    }));
  } catch {
    return [];
  }
}

function checkPm2(procs: Pm2Proc[]): HealthCheck {
  const mc = procs.find((p) => p.name === "mission-control");
  if (!mc) return { name: "pm2:mission-control", ok: false, detail: "Process not found in PM2", fixable: true };
  if (mc.status !== "online") return { name: "pm2:mission-control", ok: false, detail: `Status: ${mc.status}`, fixable: true };
  const uptimeMin = Math.round(mc.uptime / 60000);
  return { name: "pm2:mission-control", ok: true, detail: `PID ${mc.pid}, up ${uptimeMin}m`, fixable: false };
}

function checkTunnel(procs: Pm2Proc[]): HealthCheck {
  const t = procs.find((p) => p.name === "mc-tunnel");
  if (!t) return { name: "pm2:tunnel", ok: false, detail: "Tunnel process not found", fixable: true };
  if (t.status !== "online") return { name: "pm2:tunnel", ok: false, detail: `Status: ${t.status}`, fixable: true };
  return { name: "pm2:tunnel", ok: true, detail: `PID ${t.pid}`, fixable: false };
}

async function checkApiEndpoint(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function checkApiEndpointsAsync(): Promise<HealthCheck> {
  const base = "http://localhost:4317";
  const endpoints = ["/api/health", "/api/system", "/api/repos", "/api/memory", "/api/agents"];
  const results = await Promise.all(endpoints.map((ep) => checkApiEndpoint(`${base}${ep}`)));
  const failed = endpoints.filter((_, i) => !results[i]);
  if (failed.length === 0) {
    return { name: "api:endpoints", ok: true, detail: `All ${endpoints.length} endpoints respond`, fixable: false };
  }
  return {
    name: "api:endpoints",
    ok: false,
    detail: `${failed.length}/${endpoints.length} failed: ${failed.join(", ")}`,
    fixable: true,
  };
}

function checkAgentInstalls(): HealthCheck {
  const primary = getAgent("hermes") || getAgent("claude") || getAgent("pi") || getAgent("cline") || getAgent("antigravity");
  if (!primary) return { name: "agents:installed", ok: true, detail: "No primary agents configured", fixable: false };
  const missing: string[] = [];
  for (const agent of [getAgent("hermes"), getAgent("claude"), getAgent("pi"), getAgent("cline"), getAgent("antigravity")].filter(Boolean)) {
    if (!agent) continue;
    if (!resolveBinary(agent)) missing.push(agent.name);
  }
  if (missing.length === 0) {
    return { name: "agents:installed", ok: true, detail: "All primary agents installed", fixable: false };
  }
  return { name: "agents:installed", ok: false, detail: `Missing: ${missing.join(", ")}`, fixable: true };
}

function checkVault(): HealthCheck {
  try {
    if (!fs.existsSync(VAULT_DIR)) {
      return { name: "vault:exists", ok: false, detail: `Vault dir missing: ${VAULT_DIR}`, fixable: true };
    }
    const entries = fs.readdirSync(VAULT_DIR);
    return { name: "vault:exists", ok: true, detail: `${entries.length} entries`, fixable: false };
  } catch (e) {
    return { name: "vault:exists", ok: false, detail: (e as Error).message, fixable: true };
  }
}

function checkConfig(): HealthCheck {
  try {
    if (!fs.existsSync(MC_SETTINGS_FILE)) {
      return { name: "config:settings", ok: false, detail: "Settings file missing", fixable: true };
    }
    const raw = fs.readFileSync(MC_SETTINGS_FILE, "utf8");
    JSON.parse(raw);
    return { name: "config:settings", ok: true, detail: "Valid JSON", fixable: false };
  } catch (e) {
    return { name: "config:settings", ok: false, detail: (e as Error).message, fixable: true };
  }
}

function checkDiskSpace(): HealthCheck {
  try {
    const root = process.cwd().split(path.sep)[0] + path.sep;
    const st = fs.statfsSync(root);
    const freeGB = (st.bfree * st.bsize) / 1_073_741_824;
    const ok = freeGB > 1;
    return {
      name: "system:disk",
      ok,
      detail: ok ? `${freeGB.toFixed(1)} GB free` : `Low disk: ${freeGB.toFixed(1)} GB`,
      fixable: false,
    };
  } catch {
    return { name: "system:disk", ok: true, detail: "Check unavailable", fixable: false };
  }
}

export async function runHealthCheck(): Promise<HealthReport> {
  const syncChecks = [checkAgentInstalls(), checkVault(), checkConfig(), checkDiskSpace()];
  const [procs, apiCheck] = await Promise.all([listPm2Processes(), checkApiEndpointsAsync()]);
  const pm2Check = checkPm2(procs);
  const tunnelCheck = checkTunnel(procs);
  const checks = [...syncChecks, pm2Check, tunnelCheck, apiCheck];
  const allOk = checks.every((c) => c.ok);
  return { ts: new Date().toISOString(), checks, allOk };
}

export async function autoRepair(report?: HealthReport): Promise<RepairAction[]> {
  const actions: RepairAction[] = [];
  const checks = report?.checks ?? (await runHealthCheck()).checks;

  for (const check of checks) {
    if (check.ok || !check.fixable) continue;

    if (check.name === "pm2:mission-control" || check.name === "pm2:tunnel") {
      const procName = check.name === "pm2:mission-control" ? "mission-control" : "mc-tunnel";
      try {
        await pm2Exec(["restart", procName]);
        actions.push({ action: `pm2 restart ${procName}`, ok: true, detail: "Restart issued" });
        logEvent({ source: "healer", level: "warn", event: `auto-repair: restart ${procName}`, detail: "Auto-restarted by self-healing" });
      } catch (e) {
        actions.push({ action: `pm2 restart ${procName}`, ok: false, detail: (e as Error).message });
      }
    }

    if (check.name === "vault:exists") {
      try {
        fs.mkdirSync(VAULT_DIR, { recursive: true });
        actions.push({ action: "create vault dir", ok: true, detail: `Created ${VAULT_DIR}` });
        logEvent({ source: "healer", level: "info", event: "auto-repair: create vault", detail: `Created vault at ${VAULT_DIR}` });
      } catch (e) {
        actions.push({ action: "create vault dir", ok: false, detail: (e as Error).message });
      }
    }

    if (check.name === "config:settings") {
      try {
        const defaults = { routing: {}, routingPreferred: {}, providers: [], updatedAt: new Date().toISOString() };
        fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
        fs.writeFileSync(MC_SETTINGS_FILE, JSON.stringify(defaults, null, 2), "utf8");
        actions.push({ action: "reset settings.json", ok: true, detail: "Restored default settings" });
        logEvent({ source: "healer", level: "warn", event: "auto-repair: reset settings", detail: "Corrupted settings.json replaced with defaults" });
      } catch (e) {
        actions.push({ action: "reset settings.json", ok: false, detail: (e as Error).message });
      }
    }
  }

  if (actions.length === 0) {
    actions.push({ action: "no-repair-needed", ok: true, detail: "All checks passed or none fixable" });
  }
  return actions;
}

/* ------------------------------------------------------------------ *
 * Self-dev log — detailed audit trail for the designated self-updater *
 * ------------------------------------------------------------------ */

export interface SelfDevLogEntry {
  ts: string;
  agentId: string;           // the agent being updated (e.g., "claude", "pi", "cline")
  action: "check" | "update" | "rebuild" | "reload" | "skip" | "error";
  status: "started" | "completed" | "failed";
  // Universal log (brief)
  brief: string;             // e.g., "Updated claude to v1.2.3"
  // Agent page log (detailed)
  detail: {
    component: string;       // what was touched: "binary", "config", "dependency", "self"
    previousVersion?: string | null;
    newVersion?: string | null;
    reason: string;          // why: "outdated" | "conflict" | "security" | "feature" | "manual" | "scheduled"
    steps: string[];         // what commands ran
    output?: string;         // command output (truncated)
    durationMs: number;
    triggeredBy: "cron" | "manual" | "health-check" | "conflict-detection";
  };
}

/** Path to the self-dev log (JSONL, one entry per line). */
const SELF_DEV_LOG_FILE = path.join(MC_CONFIG_DIR, "self-dev.log");
const MAX_SELF_DEV_LINES = 2000;

/** Append a self-dev log entry. Never throws. */
export function logSelfDev(entry: Omit<SelfDevLogEntry, "ts">): void {
  try {
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    const full: SelfDevLogEntry = { ts: new Date().toISOString(), ...entry };
    fs.appendFileSync(SELF_DEV_LOG_FILE, JSON.stringify(full) + "\n", "utf8");
    // Trim if needed
    const lines = fs.readFileSync(SELF_DEV_LOG_FILE, "utf8").split("\n").filter(Boolean);
    if (lines.length > MAX_SELF_DEV_LINES) {
      fs.writeFileSync(SELF_DEV_LOG_FILE, lines.slice(-MAX_SELF_DEV_LINES).join("\n") + "\n", "utf8");
    }
  } catch {
    /* logging must never break the caller */
  }
}

/** Read self-dev log entries (newest first). */
export function readSelfDevLog(opts: { limit?: number; agentId?: string; since?: string } = {}): SelfDevLogEntry[] {
  const limit = opts.limit ?? 200;
  let raw: string;
  try {
    raw = fs.readFileSync(SELF_DEV_LOG_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n");
  const out: SelfDevLogEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const line = lines[i];
    if (!line) continue;
    try {
      const e = JSON.parse(line) as SelfDevLogEntry;
      if (opts.agentId && e.agentId !== opts.agentId) continue;
      if (opts.since && e.ts <= opts.since) continue;
      out.push(e);
    } catch {
      continue;
    }
  }
  return out;
}

/** Clear self-dev log (for testing). */
export function clearSelfDevLog(): void {
  try {
    fs.writeFileSync(SELF_DEV_LOG_FILE, "", "utf8");
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Agent update checking — Hermes is the designated self-updater      *
 * ------------------------------------------------------------------ */

const SELF_UPDATER_AGENT_ID = "hermes";

/* ------------------------------------------------------------------ *
 * Single-update mutex. Only one self-update (full cycle OR single-   *
 * agent) may run at a time across the whole process, no matter which  *
 * trigger fired it (cron, /api/healer/self-update, or                *
 * /api/hermes/self-update?agentId=...). A second caller skips with   *
 * a clear "already-running" result instead of racing two npm global  *
 * installs against the same package — which is what produced the     *
 * 4-way cline updater pileup. Keyless: any self-update holds the     *
 * same lock. Skip-on-busy (no queue, no backlog).                    *
 * ------------------------------------------------------------------ */
let _selfUpdateRunning = false;
const _selfUpdateWaiters: Array<() => void> = [];

/** Try to acquire the self-update lock. Returns true if acquired. */
function acquireSelfUpdateLock(): boolean {
  if (_selfUpdateRunning) return false;
  _selfUpdateRunning = true;
  return true;
}

/** Release the lock and resolve the next queued waiter (FIFO). */
function releaseSelfUpdateLock(): void {
  _selfUpdateRunning = false;
  const next = _selfUpdateWaiters.shift();
  if (next && !_selfUpdateRunning) {
    _selfUpdateRunning = true;
    next();
  }
}

/* ------------------------------------------------------------------ *
 * Single-update cross-process lock + cline auto-update suppression     *
 * ------------------------------------------------------------------ */

/**
 * Env for every agent-CLI spawn from this module. Cline ships a built-in
 * auto-updater that fires a DETACHED `npm update -g cline --tag latest
 * --min-release-age=0` the moment its CLI launches (even `--version`). That
 * detached updater is exactly what produced the 7-way npm pile-ups — it is
 * outside the in-process mutex and outside this app entirely. Setting
 * CLINE_NO_AUTO_UPDATE=1 (honored by cline's binary) turns it off. Harmless
 * for non-cline agents.
 */
const AGENT_SPAWN_ENV = { ...process.env, CLINE_NO_AUTO_UPDATE: "1" };

/** Cross-process update lock file — only ONE npm install may run at a time,
 *  no matter which trigger (cron, API, health-check, manual) fired it. */
const UPDATE_LOCK_FILE = path.join(MC_CONFIG_DIR, ".update.lock");
const UPDATE_LOCK_STALE_MS = 15 * 60_000;

function acquireUpdateLock(depth = 0): boolean {
  try {
    // Never treat a missing config dir as "lock busy" — create it first.
    fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
    const fd = fs.openSync(UPDATE_LOCK_FILE, "wx");
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
    fs.closeSync(fd);
    return true;
  } catch {
    if (depth >= 1) return false;
    try {
      const st = fs.statSync(UPDATE_LOCK_FILE);
      if (Date.now() - st.mtimeMs > UPDATE_LOCK_STALE_MS) {
        fs.unlinkSync(UPDATE_LOCK_FILE);
        return acquireUpdateLock(depth + 1);
      }
    } catch {
      /* lock vanished between stat and unlink — retry once */
      return acquireUpdateLock(depth + 1);
    }
    return false;
  }
}

function releaseUpdateLock(): void {
  try {
    fs.unlinkSync(UPDATE_LOCK_FILE);
  } catch {
    /* already gone */
  }
}

/** Check if an agent has an update available. Returns { hasUpdate, current, latest, reason }. */
async function checkAgentUpdate(agentId: string): Promise<{ hasUpdate: boolean; current: string | null; latest: string | null; reason: string }> {
  const def = getAgent(agentId);
  if (!def) return { hasUpdate: false, current: null, latest: null, reason: "unknown agent" };

  // For npm-based agents, check npm registry
  if (def.install?.manager === "npm" && def.install?.command) {
    const pkgMatch = def.install.command.match(/npm install -g\s+(\S+)/);
    if (pkgMatch) {
      const pkg = pkgMatch[1];
      try {
        // Current version — read from npm's global list, NEVER launch the CLI.
        // Launching `cline --version` triggers cline's own detached auto-update
        // (the source of the npm pile-ups); npm ls is registry-first and safe.
        const current = await new Promise<string | null>((resolve) => {
          execFile("npm", ["ls", "-g", pkg, "--json"], { timeout: 10000, windowsHide: true, env: AGENT_SPAWN_ENV }, (err, stdout) => {
            if (err) resolve(null);
            else {
              try {
                const j = JSON.parse(stdout.trim()) as { dependencies?: Record<string, { version?: string }> };
                resolve(j?.dependencies?.[pkg]?.version ?? null);
              } catch {
                resolve(null);
              }
            }
          });
        });

        // Get latest from npm
        const latest = await new Promise<string | null>((resolve) => {
          execFile("npm", ["view", pkg, "version", "--json"], { timeout: 10000, windowsHide: true, env: AGENT_SPAWN_ENV }, (err, stdout) => {
            if (err) resolve(null);
            else {
              try { resolve(JSON.parse(stdout.trim())); } catch { resolve(stdout.trim() || null); }
            }
          });
        });

        if (current && latest && current !== latest) {
          return { hasUpdate: true, current, latest, reason: "outdated" };
        }
        return { hasUpdate: false, current, latest, reason: "current" };
      } catch {
        return { hasUpdate: false, current: null, latest: null, reason: "check failed" };
      }
    }
  }

  // For winget/native agents, check winget
  if (def.install?.manager === "native") {
    try {
      const binPath = resolveBinary(def);
      let current = null;
      if (binPath) {
        const { execFile } = await import("node:child_process");
        current = await new Promise<string | null>((resolve) => {
          execFile(binPath, ["--version"], { timeout: 3000, windowsHide: true, env: AGENT_SPAWN_ENV }, (err, stdout) => {
            if (err) resolve(null);
            else resolve(stdout?.trim() || null);
          });
        });
      }
      // winget list doesn't easily give latest without upgrade dry-run
      // For now, just report current version
      return { hasUpdate: false, current, latest: null, reason: "native (winget)" };
    } catch {
      return { hasUpdate: false, current: null, latest: null, reason: "check failed" };
    }
  }

  return { hasUpdate: false, current: null, latest: null, reason: "no update mechanism" };
}

/** Run update for a single agent. Returns success + detail. */
async function updateAgent(
  agentId: string,
  triggeredBy: SelfDevLogEntry["detail"]["triggeredBy"] = "cron"
): Promise<{ ok: boolean; skipped?: boolean; detail: SelfDevLogEntry["detail"] }> {
  const def = getAgent(agentId);
  if (!def) return { ok: false, detail: { component: "binary", reason: "unknown agent", steps: [], durationMs: 0, triggeredBy } };
  const start = Date.now();
  const steps: string[] = [];
  let output = "";

  try {
    // Get current version before
    const binPath = resolveBinary(def);
    let previousVersion = null;
    if (binPath) {
      const { execFile } = await import("node:child_process");
      previousVersion = await new Promise<string | null>((resolve) => {
        execFile(binPath, ["--version"], { timeout: 3000, windowsHide: true, env: AGENT_SPAWN_ENV }, (err, stdout) => {
          if (err) resolve(null);
          else resolve(stdout?.trim() || null);
        });
      });
    }

    // Run install command — guarded by the CROSS-PROCESS update lock so only
    // ONE npm install runs at a time across the whole machine, no matter which
    // trigger (cron, API, health-check, manual) fired it.
    if (def.install?.command) {
      if (!acquireUpdateLock()) {
        const skip = {
          agentId,
          action: "skip" as const,
          status: "completed" as const,
          brief: `${def.name} update skipped — another npm install already running (one update at a time)`,
          detail: {
            component: "binary" as const,
            reason: "already-running" as const,
            steps: ["update lock busy"],
            output: "skipped — the cross-process update lock is held by another install",
            durationMs: 0,
            triggeredBy,
          },
        };
        // Signal skip explicitly so the caller can log it as "skipped", not "failed"
        // (the caller already writes the self-dev entry — no double-log here).
        return { ok: false, skipped: true, detail: skip.detail };
      }
      try {
        steps.push(`Running: ${def.install.command}`);
        const { execFile } = await import("node:child_process");
        const cmd = def.install.command;
        const isBatch = process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd.split(" ")[0]);
        const file = isBatch ? process.env.ComSpec || "cmd.exe" : cmd.split(" ")[0];
        const args = isBatch ? ["/c", cmd] : cmd.split(" ").slice(1);

        const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
          const child = execFile(file, args, { timeout: 120000, windowsHide: true, maxBuffer: 1024 * 1024, env: AGENT_SPAWN_ENV }, (err, stdout, stderr) => {
            resolve({ code: err ? (err as any).code || 1 : 0, stdout: stdout || "", stderr: stderr || "" });
          });
          child.on("error", (e) => resolve({ code: 1, stdout: "", stderr: e.message }));
        });

        output = result.stdout + "\n" + result.stderr;
        steps.push(`Exit code: ${result.code}`);

        if (result.code !== 0) {
          throw new Error(`Install failed with code ${result.code}`);
        }
      } finally {
        releaseUpdateLock();
      }
    }

    // Get new version after
    let newVersion = null;
    if (binPath) {
      const { execFile } = await import("node:child_process");
      newVersion = await new Promise<string | null>((resolve) => {
        execFile(binPath, ["--version"], { timeout: 3000, windowsHide: true, env: AGENT_SPAWN_ENV }, (err, stdout) => {
          if (err) resolve(null);
          else resolve(stdout?.trim() || null);
        });
      });
    }

    const durationMs = Date.now() - start;
    const detail: SelfDevLogEntry["detail"] = {
      component: "binary",
      previousVersion,
      newVersion,
      reason: "outdated",
      steps,
      output: output.slice(0, 2000),
      durationMs,
      triggeredBy,
    };

    return { ok: true, detail };
  } catch (e) {
    const durationMs = Date.now() - start;
    return { 
      ok: false, 
      detail: { 
        component: "binary", 
        reason: "error", 
        steps, 
        output: (e as Error).message + "\n" + output,
        durationMs, 
        triggeredBy 
      } 
    };
  }
}

/** Check all agents for updates and update them. Called by cron. */
export async function runSelfUpdateCycle(triggeredBy: SelfDevLogEntry["detail"]["triggeredBy"] = "cron"): Promise<SelfDevLogEntry[]> {
  // Serialize: skip entirely if another self-update (full cycle or single
  // agent) is already in progress. Returns an empty result set so callers
  // (cron, /api/healer/self-update) treat this as a no-op, not a failure.
  if (!acquireSelfUpdateLock()) {
    logSelfDev({
      agentId: "healer",
      action: "skip",
      status: "completed",
      brief: "Self-update cycle skipped — another update already running",
      detail: { component: "self", reason: "already-running", steps: [], durationMs: 0, triggeredBy },
    });
    return [];
  }
  let released = false;
  const release = () => { if (!released) { released = true; releaseSelfUpdateLock(); } };

  const results: SelfDevLogEntry[] = [];

  // Get all primary CLI agents (the ones that should be kept updated)
  const primaryAgentIds = ["claude", "pi", "cline", "openclaw", "jcode", "vibe", "codex", "sentinel", "pi"];

  for (const agentId of primaryAgentIds) {
    const def = getAgent(agentId);
    if (!def) continue;

    // Log check start
    logSelfDev({
      agentId,
      action: "check",
      status: "started",
      brief: `Checking ${def.name} for updates`,
      detail: { component: "binary", reason: "scheduled", steps: ["npm view / winget check"], durationMs: 0, triggeredBy },
    });

    const check = await checkAgentUpdate(agentId);

    if (check.hasUpdate) {
      // Log update start
      logSelfDev({
        agentId,
        action: "update",
        status: "started",
        brief: `Updating ${def.name} from ${check.current} to ${check.latest}`,
        detail: { component: "binary", previousVersion: check.current, newVersion: check.latest, reason: "outdated", steps: ["Starting update..."], durationMs: 0, triggeredBy },
      });

      // Run update
      const result = await updateAgent(agentId, triggeredBy);

      // Log completion — a lock-busy skip is "skipped", not "failed".
      const action = result.skipped ? "skip" : "update";
      logSelfDev({
        agentId,
        action,
        status: result.ok || result.skipped ? "completed" : "failed",
        brief: result.ok
          ? `Updated ${def.name} to ${result.detail.newVersion}`
          : result.skipped
            ? `${def.name} update skipped — another npm install already running`
            : `Failed to update ${def.name}: ${result.detail.output?.slice(0, 100)}`,
        detail: result.detail,
      });

      results.push({
        ts: new Date().toISOString(),
        agentId,
        action,
        status: result.ok || result.skipped ? "completed" : "failed",
        brief: result.ok
          ? `Updated ${def.name} to ${result.detail.newVersion}`
          : result.skipped
            ? `${def.name} update skipped — another npm install already running`
            : `Failed to update ${def.name}`,
        detail: result.detail,
      });

      // Also log to universal log (brief)
      logEvent({
        source: "healer",
        level: result.ok ? "info" : result.skipped ? "info" : "warn",
        event: result.skipped ? `self-update skipped: ${agentId}` : `self-update: ${agentId}`,
        detail: result.ok
          ? `Updated ${def.name} to ${result.detail.newVersion}`
          : result.skipped
            ? `${def.name} update skipped — lock held by another install`
            : `Update failed: ${result.detail.output?.slice(0, 200)}`,
      });
    } else {
      // Log skip
      logSelfDev({
        agentId,
        action: "skip",
        status: "completed",
        brief: `${def.name} is up to date (${check.current || "unknown"})`,
        detail: { component: "binary", previousVersion: check.current, reason: check.reason, steps: ["Version check passed"], durationMs: 0, triggeredBy },
      });
    }
  }

  release();
  return results;
}

/** Check a specific agent manually. */
export async function checkAndUpdateAgent(agentId: string): Promise<SelfDevLogEntry | null> {
  // Serialize against runSelfUpdateCycle and any other checkAndUpdateAgent
  // call: skip (no-op, not an error) if an update is already in flight.
  if (!acquireSelfUpdateLock()) {
    logSelfDev({
      agentId,
      action: "skip",
      status: "completed",
      brief: `${getAgent(agentId)?.name ?? agentId} update skipped — another update already running`,
      detail: { component: "self", reason: "already-running", steps: [], durationMs: 0, triggeredBy: "manual" },
    });
    return null;
  }
  let released = false;
  const release = () => { if (!released) { released = true; releaseSelfUpdateLock(); } };
  const def = getAgent(agentId);
  if (!def) { release(); return null; }

  const check = await checkAgentUpdate(agentId);
  if (!check.hasUpdate) {
    logSelfDev({
      agentId,
      action: "skip",
      status: "completed",
      brief: `${def.name} is up to date (${check.current || "unknown"})`,
      detail: { component: "binary", previousVersion: check.current, reason: check.reason, steps: ["Manual check"], durationMs: 0, triggeredBy: "manual" },
    });
    release();
    return null;
  }

  logSelfDev({
    agentId,
    action: "update",
    status: "started",
    brief: `Manual update: ${def.name} ${check.current} → ${check.latest}`,
    detail: { component: "binary", previousVersion: check.current, newVersion: check.latest, reason: "outdated", steps: ["Manual update initiated"], durationMs: 0, triggeredBy: "manual" },
  });

  const result = await updateAgent(agentId, "manual");
  release();

  const action = result.skipped ? "skip" : "update";
  logSelfDev({
    agentId,
    action,
    status: result.ok || result.skipped ? "completed" : "failed",
    brief: result.ok
      ? `Updated ${def.name} to ${result.detail.newVersion}`
      : result.skipped
        ? `${def.name} update skipped — another npm install already running`
        : `Failed to update ${def.name}`,
    detail: result.detail,
  });

  logEvent({
    source: "healer",
    level: result.ok || result.skipped ? "info" : "warn",
    event: result.skipped ? `self-update skipped: ${agentId} (manual)` : `self-update: ${agentId} (manual)`,
    detail: result.ok
      ? `Updated ${def.name} to ${result.detail.newVersion}`
      : result.skipped
        ? `${def.name} update skipped — lock held by another install`
        : `Update failed`,
  });

  return {
    ts: new Date().toISOString(),
    agentId,
    action,
    status: result.ok || result.skipped ? "completed" : "failed",
    brief: result.ok
      ? `Updated ${def.name} to ${result.detail.newVersion}`
      : result.skipped
        ? `${def.name} update skipped — another npm install already running`
        : `Failed to update ${def.name}`,
    detail: result.detail,
  };
}