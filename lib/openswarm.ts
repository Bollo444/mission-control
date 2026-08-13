import fs from "node:fs";
import path from "node:path";
import { home, repo } from "./paths";

/*
 * OpenSwarm TUI launcher (the Sentinel panel's real CLI).
 *
 * The Sentinel workspace (./sentinel) is a fork of VRSEN/OpenSwarm. Its real
 * interface is the Agent Swarm terminal TUI — the opencode/Claude-Code-style
 * full-screen UI — which lives in a platform binary. The official entry
 * (`node sentinel/bin/openswarm`) resolves that binary through
 * `node_modules/@vrsen/openswarm-cli-<platform>-<arch>`, but that freshly
 * downloaded 155 MB .exe is intermittently invisible to fs access (Windows
 * Defender scans new executables and blocks opens during the scan window),
 * which makes the launcher's existsSync-based resolution fail sporadically.
 *
 * Instead we spawn the JS CLI shim (`agentswarm-cli/bin/agentswarm`) directly
 * with AGENTSWARM_BIN_PATH pointed at the STABLE binary: the one OpenSwarm
 * cached in %LOCALAPPDATA%\Agency Swarm when the harness was first used (on
 * disk for months, verified 10/10 stable), falling back to the workspace
 * platform package. This is exactly the env contract bin/openswarm would set
 * (see sentinel/openswarm.config.mjs getProductEnv) minus the cosmetic TUI
 * logo arrays, which the binary replaces with its own branding.
 */

/** The TUI binary candidates, most stable first. */
function openSwarmBinCandidates(): string[] {
  return [
    home(
      "AppData",
      "Local",
      "Agency Swarm",
      "agentswarm-cli",
      "1.4.24",
      "agentswarm-cli-windows-arm64",
      "agentswarm.exe"
    ),
    repo(
      "sentinel",
      "node_modules",
      "@vrsen",
      "openswarm-cli-windows-arm64",
      "bin",
      "agentswarm.exe"
    ),
  ];
}

/** Synchronous ~300ms sleep (Atomics.wait on a throwaway buffer). */
function sleepMs(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    /* some environments restrict SharedArrayBuffer — ignore */
  }
}

/** statSync with a short retry — rides out transient Defender scan windows. */
function statOk(p: string): boolean {
  for (let i = 0; i < 3; i++) {
    try {
      fs.statSync(p);
      return true;
    } catch {
      /* transient — retry after a beat */
      sleepMs(300);
    }
  }
  return false;
}

/** Resolve the OpenSwarm TUI binary, or null if the harness isn't installed. */
export function resolveOpenSwarmBin(): string | null {
  for (const p of openSwarmBinCandidates()) {
    if (statOk(p)) return p;
  }
  return null;
}

/** The JS CLI shim that spawns the TUI binary with AGENTSWARM_BIN_PATH. */
export function openSwarmCli(): string {
  return repo("sentinel", "node_modules", "agentswarm-cli", "bin", "agentswarm");
}

function stateRoot(): string {
  return path.join(process.env.APPDATA || home("AppData", "Roaming"), "OpenSwarm");
}

/** The env contract bin/openswarm sets (mirrors getProductEnv). */
export function openSwarmEnv(binPath: string): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    TERM: "xterm-256color",
    AGENTSWARM_LAUNCHER: "1",
    AGENTSWARM_BIN_PATH: binPath,
    // product branding / config (sentinel/openswarm.config.mjs)
    AGENTSWARM_PRODUCT_DISPLAY_NAME: "OpenSwarm",
    AGENTSWARM_PRODUCT_COMMAND: "openswarm",
    AGENTSWARM_PRODUCT_PACKAGE_NAME: "@vrsen/openswarm",
    AGENTSWARM_PRODUCT_LAUNCHER_PACKAGE_NAME: "@vrsen/openswarm",
    AGENTSWARM_PRODUCT_RELEASE_REPO: "VRSEN/OpenSwarm",
    AGENTSWARM_PRODUCT_DOCS_URL: "https://github.com/VRSEN/OpenSwarm",
    AGENTSWARM_PRODUCT_ISSUE_URL: "https://github.com/VRSEN/OpenSwarm/issues/new?template=bug-report.yml",
    AGENTSWARM_PRODUCT_MDNS_DOMAIN: "openswarm.local",
    AGENTSWARM_PRODUCT_STARTER_REPO: "VRSEN/OpenSwarm",
    AGENTSWARM_PRODUCT_STARTER_FOLDER: "openswarm",
    AGENTSWARM_PRODUCT_ENTRY_FILES: "swarm.py",
    AGENTSWARM_PRODUCT_SKIP_POST_AUTH_MODEL_SELECTION: "true",
    AGENTSWARM_PRODUCT_PYTHON_ENVIRONMENT: "standalone",
    AGENTSWARM_PRODUCT_ENABLE_ADDONS: "true",
    AGENTSWARM_PRODUCT_ADDONS: JSON.stringify([
      { id: "search", title: "Web Search", keys: ["SEARCH_API_KEY"] },
      { id: "anthropic", title: "Anthropic Claude", keys: ["ANTHROPIC_API_KEY"], excludeProviders: ["anthropic"] },
      { id: "composio", title: "Composio", keys: ["COMPOSIO_API_KEY", "COMPOSIO_USER_ID"] },
      { id: "google", title: "Google Gemini", keys: ["GOOGLE_API_KEY"], excludeProviders: ["google"] },
      { id: "fal", title: "Fal.ai", keys: ["FAL_KEY"] },
      { id: "pexels", title: "Pexels", keys: ["PEXELS_API_KEY"] },
      { id: "pixabay", title: "Pixabay", keys: ["PIXABAY_API_KEY"] },
      { id: "unsplash", title: "Unsplash", keys: ["UNSPLASH_ACCESS_KEY"] },
    ]),
    AGENTSWARM_PRODUCT_STATE_ROOT: stateRoot(),
    AGENTSWARM_PRODUCT_VERSION: "1.0.1-rc.7",
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
  };
}

export interface OpenSwarmLaunch {
  cmd: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * Ready-to-spawn launcher spec: `node <cli-shim>` in the Sentinel workspace.
 * Returns null when the TUI binary can't be resolved (harness not installed).
 */
export function openSwarmLaunch(): OpenSwarmLaunch | null {
  const binPath = resolveOpenSwarmBin();
  if (!binPath) return null;
  return {
    cmd: process.execPath,
    args: [openSwarmCli()],
    cwd: repo("sentinel"),
    env: openSwarmEnv(binPath),
  };
}

/** True when the Sentinel workspace has the OpenSwarm TUI installed. */
export function openSwarmAvailable(): boolean {
  return Boolean(resolveOpenSwarmBin()) && fs.existsSync(openSwarmCli());
}
