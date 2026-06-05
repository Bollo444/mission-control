import os from "node:os";
import path from "node:path";

export const HOME = os.homedir();

/** Resolve a path that may start with ~ or be relative to the user home. */
export function home(...parts: string[]): string {
  return path.join(HOME, ...parts);
}

/**
 * Location of the shared Obsidian memory vault. Configurable via env so the
 * user can point it at an existing vault; defaults to a vault next to home.
 */
export const VAULT_DIR =
  process.env.MC_VAULT_DIR || home("MissionControlVault");

/** Where the dashboard persists its own settings (model routing, overrides). */
export const MC_CONFIG_DIR = home(".mission-control");
export const MC_SETTINGS_FILE = path.join(MC_CONFIG_DIR, "settings.json");

/** Repo root — the dashboard runs from its own project directory. Used for
 *  workspace-local agents (e.g. the gitignored Sentinel security swarm). */
export const REPO_ROOT = process.cwd();
export function repo(...parts: string[]): string {
  return path.join(REPO_ROOT, ...parts);
}
