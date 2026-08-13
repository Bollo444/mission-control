import fs from "node:fs";
import { home } from "./paths";

/*
 * Boot-to-prompt prep. Each CLI agent should open ALREADY at a prompt — no
 * trust dialogs, no update nags, no first-run menus. Two mechanisms:
 *
 * 1. Config pre-seeding (prepareAgentBoot) — one-time config edits that make
 *    the CLI skip its onboarding natively:
 *      • claude — pre-approve workspace trust (~/.claude.json projects map,
 *        the same flag Claude writes when you answer "Yes, I trust this folder").
 *      • vibe   — disable the release-update prompts (~/.vibe/config.toml).
 *
 * 2. Boot answers (BOOT_ANSWERS) — the PTY watches the agent's boot stream for
 *    known onboarding prompts and answers them once per session (jcode's
 *    Alacritty prompt, codex's update menu, claude's trust dialog as a belt
 *    behind the config, pi's update nags, and OpenSwarm's first-run menu).
 *
 * Run-once per process: the config edits happen at most once per server boot.
 */

const PREPARED = new Set<string>();

function backup(p: string): void {
  try {
    fs.copyFileSync(p, `${p}.mc-bak`);
  } catch {
    /* no original to back up */
  }
}

/** Pre-approve Claude Code workspace trust for the dirs agents boot into. */
function prepareClaudeTrust(): void {
  const file = home(".claude.json");
  if (!fs.existsSync(file)) return;
  let cfg: { projects?: Record<string, Record<string, unknown>> };
  try {
    cfg = JSON.parse(fs.readFileSync(file, "utf8")) as typeof cfg;
  } catch {
    return; // never corrupt a file we can't parse
  }
  cfg.projects ??= {};
  // The dirs agents are launched in — home, workspace, repo workspace,
  // and this repo itself. Both slash forms because Claude keys projects both ways.
  const targets = [home(), home("workspace"), home("repos"), home("mission-control")];
  let changed = false;
  for (const t of targets) {
    for (const key of [t, t.replace(/\\/g, "/")]) {
      const p = (cfg.projects[key] ??= {});
      if (p.hasTrustDialogAccepted !== true) {
        p.hasTrustDialogAccepted = true;
        changed = true;
      }
      if (p.hasCompletedProjectOnboarding !== true) {
        p.hasCompletedProjectOnboarding = true;
        changed = true;
      }
    }
  }
  if (!changed) return;
  backup(file);
  try {
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2), "utf8");
  } catch {
    /* best effort — never block a launch on this */
  }
}

/** Disable Vibe's release-update prompts so it boots straight to the prompt. */
function prepareVibeConfig(): void {
  const file = home(".vibe", "config.toml");
  if (!fs.existsSync(file)) return;
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  const next = raw
    .replace(/^enable_update_checks\s*=\s*true/m, "enable_update_checks = false")
    .replace(/^enable_auto_update\s*=\s*true/m, "enable_auto_update = false");
  if (next === raw) return;
  backup(file);
  try {
    fs.writeFileSync(file, next, "utf8");
  } catch {
    /* best effort */
  }
}

/**
 * Run the config pre-seeding for an agent. Idempotent and cheap after the
 * first call per process.
 */
export function prepareAgentBoot(agentId: string): void {
  if (PREPARED.has(agentId)) return;
  PREPARED.add(agentId);
  switch (agentId) {
    case "claude":
      prepareClaudeTrust();
      break;
    case "vibe":
      prepareVibeConfig();
      break;
    default:
      break;
  }
}

export interface BootAnswer {
  id: string;
  /** Matched against the ANSI-stripped session stream. */
  test: RegExp;
  /** Keystrokes sent once when the prompt appears. */
  send: string;
  label: string;
}

/**
 * Known onboarding prompts, answered once per session. Every test is anchored
 * to the prompt's own wording so a stray word can't trigger it.
 */
export const BOOT_ANSWERS: BootAnswer[] = [
  // jcode: "Install Alacritty? [y] Install [n] Not now [d] Don't ask again"
  { id: "jcode-alacritty", test: /alacritty[\s\S]{0,160}don'?t ask again/i, send: "d", label: "jcode: skip Alacritty prompt" },
  // codex: "✨ Update available! 0.145.0 -> 0.147.0 … Release notes …" — the banner
  // advances with Enter and performs the update (observed in the embedded PTY);
  // codex is current afterwards, so this only fires when a release is behind.
  { id: "codex-update", test: /update available[\s\S]{0,140}release notes/i, send: "\r", label: "codex: apply update banner" },
  // codex: workspace trust — one-time per directory, answered with y.
  { id: "codex-trust", test: /do you trust the contents of this directory/i, send: "y\r", label: "codex: accept workspace trust" },
  // codex: hooks review screen — informational, dismissed with esc.
  { id: "codex-hooks", test: /enter to review hooks|review hooks; esc to close/i, send: "\x1b", label: "codex: dismiss hooks screen" },
  // claude: trust dialog — belt behind the ~/.claude.json pre-seed
  { id: "claude-trust", test: /is this a project you created or one you trust[\s\S]{0,140}yes, i trust this folder/i, send: "1\r", label: "claude: accept workspace trust" },
  // pi: update nag boxes ("Update Available … Run pi update") — dismiss
  { id: "pi-update-nag", test: /update available[\s\S]{0,180}run pi update/i, send: "\r", label: "pi: dismiss update nag" },
  // OpenSwarm first-run menu → drive a local starter project once
  { id: "openswarm-start", test: /how do you want to start[\s\S]{0,140}create a new starter project/i, send: "\r", label: "openswarm: start menu → starter" },
  { id: "openswarm-name", test: /project or repository name/i, send: "sentinel-agency\r", label: "openswarm: project name" },
  { id: "openswarm-local", test: /how should the starter be created[\s\S]{0,160}create a local folder/i, send: "\x1b[B\r", label: "openswarm: local folder" },
  { id: "openswarm-venv", test: /create a local \.venv in this project/i, send: "\r", label: "openswarm: create venv" },
];

/** The boot answers for a given agent id (answer ids are prefixed by agent). */
export function answersForAgent(agentId: string): BootAnswer[] {
  return BOOT_ANSWERS.filter((a) => a.id.startsWith(`${agentId}-`));
}

/** Strip ANSI escapes so prompt text matches reliably. */
export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[()][0-9A-Za-z]/g, "")
    .replace(/\r/g, "");
}
