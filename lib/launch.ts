import { spawn } from "node:child_process";
import fs from "node:fs";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { appendActivity } from "./memory";

const isWin = process.platform === "win32";

interface LaunchResult {
  ok: boolean;
  message: string;
}

/** Open a new, visible terminal window running `commandLine` in `cwd`. */
function openTerminal(commandLine: string, cwd?: string): void {
  const opts = {
    cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
    detached: true,
    stdio: "ignore" as const,
    windowsHide: false,
  };
  if (isWin) {
    // `start "" cmd /k <cmd>` opens a fresh window that stays open afterwards.
    const child = spawn(
      "cmd.exe",
      ["/c", "start", "", "cmd", "/k", commandLine],
      opts
    );
    child.unref();
  } else {
    const child = spawn("/bin/sh", ["-c", commandLine], opts);
    child.unref();
  }
}

export function launchAgent(id: string, cwd?: string): LaunchResult {
  const def = getAgent(id);
  if (!def) return { ok: false, message: `Unknown agent: ${id}` };

  // IDE agents open their application window.
  if (def.kind === "ide" && def.openCommand) {
    const { cmd, args } = def.openCommand;
    const all = cwd ? [...args, cwd] : args.length ? args : ["."];
    if (!fs.existsSync(cmd)) {
      return { ok: false, message: `${def.name} not found at ${cmd}` };
    }
    const child = spawn("cmd.exe", ["/c", cmd, ...all], {
      cwd: cwd && fs.existsSync(cwd) ? cwd : undefined,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
    appendActivity({
      agentId: id,
      agentName: def.name,
      action: "opened the IDE",
      detail: cwd || "default workspace",
    });
    return { ok: true, message: `Opening ${def.name}…` };
  }

  if (!def.launch) {
    return { ok: false, message: `${def.name} has no launch command configured.` };
  }

  const bin = resolveBinary(def);
  if (!bin) {
    return {
      ok: false,
      message: `${def.name} is not installed. Use the install action first.`,
    };
  }

  const cmdLine = [def.launch.cmd, ...def.launch.args].join(" ");
  openTerminal(cmdLine, cwd);
  appendActivity({
    agentId: id,
    agentName: def.name,
    action: "launched a session",
    detail: cwd || "interactive",
  });
  return { ok: true, message: `Launched ${def.name} in a new terminal.` };
}

export function installAgent(id: string): LaunchResult {
  const def = getAgent(id);
  if (!def) return { ok: false, message: `Unknown agent: ${id}` };
  if (!def.install || !def.install.command) {
    return { ok: false, message: `No install command available for ${def.name}.` };
  }
  // Run installs in a visible terminal so package-manager prompts remain
  // interactive — nothing is installed silently.
  const note = def.install.unverified
    ? `echo [Mission Control] Verify this package is correct before continuing. && `
    : "";
  openTerminal(`${note}${def.install.command}`);
  appendActivity({
    agentId: id,
    agentName: def.name,
    action: "started install",
    detail: def.install.command,
  });
  return {
    ok: true,
    message: `Install started in a new terminal: ${def.install.command}`,
  };
}
