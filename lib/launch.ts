import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getAgent } from "./registry";
import { resolveBinary } from "./detect";
import { appendActivity } from "./memory";
import { openSwarmLaunch } from "./openswarm";
import { prepareAgentBoot } from "./agent-boot";

const isWin = process.platform === "win32";

/** POSIX single-quote a string so a shell treats it as one literal argument. */
function shquote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Escape a string for embedding inside an AppleScript double-quoted literal. */
function asquote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** True if `name` resolves on PATH (used to find a Linux terminal emulator). */
function onPath(name: string): boolean {
  const env = process.env.PATH || "";
  return env
    .split(path.delimiter)
    .some((dir) => dir && fs.existsSync(path.join(dir, name)));
}

/** Linux terminal emulators to try, in order, with how each takes a command. */
const LINUX_TERMINALS: [string, (sh: string) => string[]][] = [
  ["x-terminal-emulator", (sh) => ["-e", "bash", "-lc", sh]],
  ["gnome-terminal", (sh) => ["--", "bash", "-lc", sh]],
  ["konsole", (sh) => ["-e", "bash", "-lc", sh]],
  ["xfce4-terminal", (sh) => ["-x", "bash", "-lc", sh]],
  ["kitty", (sh) => ["bash", "-lc", sh]],
  ["alacritty", (sh) => ["-e", "bash", "-lc", sh]],
  ["xterm", (sh) => ["-e", "bash", "-lc", sh]],
];

interface LaunchResult {
  ok: boolean;
  message: string;
}

/**
 * Open a new, visible terminal window running `commandLine` in `cwd`.
 * Cross-platform: Windows (cmd), macOS (Terminal.app via AppleScript), and
 * Linux (the first available terminal emulator). On Linux with no emulator
 * found, the command still runs detached so the action isn't lost.
 */
function safeCwd(cwd?: string): string | undefined {
  if (!cwd) return undefined;
  if (/[&|<>^%!"\r\n]/.test(cwd)) return undefined;
  const homeDir = path.resolve(os.homedir());
  const resolved = path.resolve(cwd);
  if (resolved !== homeDir && !resolved.startsWith(homeDir + path.sep)) return undefined;
  try {
    const real = fs.realpathSync(resolved);
    return real === homeDir || real.startsWith(homeDir + path.sep) ? real : undefined;
  } catch {
    return undefined;
  }
}

function openTerminal(commandLine: string, cwd?: string): void {
  const wd = safeCwd(cwd);
  const opts = { detached: true, stdio: "ignore" as const, windowsHide: false };

  if (isWin) {
    // `start "" cmd /k <cmd>` opens a fresh window that stays open afterwards.
    const inner = wd ? `cd /d ${JSON.stringify(wd)} && ${commandLine}` : commandLine;
    spawn("cmd.exe", ["/c", "start", "", "cmd", "/k", inner], opts).unref();
    return;
  }

  if (process.platform === "darwin") {
    // Drive Terminal.app so a real, visible window opens (not a detached process).
    const line = (wd ? "cd " + shquote(wd) + "; " : "") + commandLine;
    const osa = `tell application "Terminal"\n  activate\n  do script ${asquote(line)}\nend tell`;
    spawn("osascript", ["-e", osa], opts).unref();
    return;
  }

  // Linux / other Unix: keep the shell open after the command exits.
  const line = (wd ? "cd " + shquote(wd) + "; " : "") + commandLine + '; exec "${SHELL:-bash}"';
  const term = LINUX_TERMINALS.find(([bin]) => onPath(bin));
  if (term) {
    spawn(term[0], term[1](line), { ...opts, cwd: wd }).unref();
  } else {
    spawn("/bin/sh", ["-c", line], { ...opts, cwd: wd }).unref();
  }
}

export function launchAgent(id: string, cwd?: string): LaunchResult {
  const def = getAgent(id);
  if (!def) return { ok: false, message: `Unknown agent: ${id}` };

  // Boot-to-prompt prep (claude trust, vibe update checks) so the launched
  // terminal opens at a prompt instead of onboarding.
  prepareAgentBoot(id);

  // IDE agents open their application window.
  if (def.kind === "ide" && def.openCommand) {
    const { cmd, args } = def.openCommand;
    const all = cwd ? [...args, cwd] : args.length ? args : ["."];
    if (!fs.existsSync(cmd)) {
      return { ok: false, message: `${def.name} not found at ${cmd}` };
    }
    if (cwd && !safeCwd(cwd)) {
      return { ok: false, message: "Working directory must be an existing path inside the home directory." };
    }
    const safeDirectory = safeCwd(cwd);
    const spawnOpts = {
      cwd: safeDirectory,
      detached: true,
      stdio: "ignore" as const,
      windowsHide: false,
    };
    // On Windows route through cmd so `.cmd`/`.bat` shims launch; elsewhere run
    // the IDE binary directly.
    const child = isWin
      ? spawn("cmd.exe", ["/c", cmd, ...all], spawnOpts)
      : spawn(cmd, all, spawnOpts);
    child.unref();
    appendActivity({
      agentId: id,
      agentName: def.name,
      action: "opened the IDE",
      detail: safeDirectory || "default workspace",
    });
    return { ok: true, message: `Opening ${def.name}…` };
  }

  // Sentinel launches the OpenSwarm TUI — the real Agent Swarm harness — in a
  // visible console window, with the product env (AGENTSWARM_BIN_PATH etc.).
  // A direct detached spawn beats a `start cmd /k` line because the env can't
  // be passed through a command string reliably (paths with spaces).
  if (id === "sentinel") {
    const launch = openSwarmLaunch();
    if (!launch) {
      return {
        ok: false,
        message: `${def.name}: OpenSwarm TUI not installed — run the setup first (sentinel/README.local.md).`,
      };
    }
    spawn(launch.cmd, launch.args, {
      cwd: launch.cwd,
      env: launch.env as NodeJS.ProcessEnv,
      detached: true,
      stdio: "ignore" as const,
      windowsHide: false, // visible console window for the TUI
    }).unref();
    appendActivity({
      agentId: id,
      agentName: def.name,
      action: "launched the OpenSwarm TUI",
      detail: "sentinel workspace",
    });
    return { ok: true, message: `Launched ${def.name} (OpenSwarm TUI) in a new terminal.` };
  }

  if (cwd && !safeCwd(cwd)) {
    return { ok: false, message: "Working directory must be an existing path inside the home directory." };
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
