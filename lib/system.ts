import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { AGENTS } from "./registry";
import { getAgentStatus } from "./detect";
import { VAULT_DIR } from "./paths";
import { readActivity, vaultExists } from "./memory";
import type { FleetAgentLine, FleetState, SystemReport } from "./types";

/**
 * A genuine snapshot of the host + fleet — no mock data. Sampled live each call:
 * CPU is measured across a short interval, memory/disk read from the OS, and the
 * fleet section reflects which agent binaries actually resolve right now.
 */

/** Aggregate non-idle CPU % across all cores, measured over a short window. */
async function cpuUsagePct(sampleMs = 90): Promise<number> {
  const snapshot = () => {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
      for (const v of Object.values(cpu.times)) total += v;
      idle += cpu.times.idle;
    }
    return { idle, total };
  };
  const a = snapshot();
  await new Promise((r) => setTimeout(r, sampleMs));
  const b = snapshot();
  const idleDelta = b.idle - a.idle;
  const totalDelta = b.total - a.total;
  if (totalDelta <= 0) return 0;
  return clampPct(Math.round((1 - idleDelta / totalDelta) * 100));
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

/** Disk capacity for the volume the app lives on (uses Node 18.15+ statfs). */
function diskUsage(): SystemReport["disk"] {
  try {
    const drive =
      process.platform === "win32" ? process.cwd().slice(0, 3) : "/";
    const s = fs.statfsSync(drive);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    const used = total - free;
    return {
      drive,
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      usedPct: total ? clampPct(Math.round((used / total) * 100)) : 0,
    };
  } catch {
    return null;
  }
}

function vaultHealth(): SystemReport["vault"] {
  const exists = vaultExists();
  let agentNotes = 0;
  try {
    agentNotes = fs
      .readdirSync(path.join(VAULT_DIR, "Agents"))
      .filter((f) => f.endsWith(".md")).length;
  } catch {
    agentNotes = 0;
  }
  const activity = readActivity(500);
  return {
    dir: VAULT_DIR,
    exists,
    agentNotes,
    activityEntries: activity.length,
    lastActivity: activity[0]?.ts ?? null,
  };
}

export async function getSystemReport(): Promise<SystemReport> {
  const [usagePct, statuses] = await Promise.all([
    cpuUsagePct(),
    Promise.all(AGENTS.map((def) => getAgentStatus(def))),
  ]);

  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  const lines: FleetAgentLine[] = AGENTS.map((def, i) => {
    const st = statuses[i];
    const state: FleetState = st.binPath
      ? "ready"
      : st.hasConfig
        ? "config"
        : "offline";
    return {
      id: def.id,
      name: def.name,
      accent: def.accent,
      glyph: def.glyph,
      state,
      version: st.version,
      sessions: st.sessionCount,
    };
  });

  const ready = lines.filter((l) => l.state === "ready").length;
  const config = lines.filter((l) => l.state === "config").length;
  const offline = lines.filter((l) => l.state === "offline").length;
  const sessions = lines.reduce((n, l) => n + l.sessions, 0);
  const lastActive =
    statuses
      .map((s) => s.lastActive)
      .filter(Boolean)
      .sort()
      .pop() ?? null;

  return {
    generatedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      hostname: os.hostname(),
      type: os.type(),
    },
    uptimeSec: Math.round(os.uptime()),
    node: process.version,
    cpu: {
      model: (cpus[0]?.model ?? "unknown").replace(/\s+/g, " ").trim(),
      cores: cpus.length,
      speedMHz: cpus[0]?.speed ?? 0,
      usagePct,
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usedPct: totalMem ? clampPct(Math.round((usedMem / totalMem) * 100)) : 0,
    },
    disk: diskUsage(),
    vault: vaultHealth(),
    fleet: {
      total: lines.length,
      ready,
      config,
      offline,
      sessions,
      lastActive,
      agents: lines,
    },
  };
}
