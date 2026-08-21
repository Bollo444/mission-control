/**
 * orb/security.ts — the operator security gate for the orb's executor path.
 *
 * Destructive shell operations (recursive deletes, force-pushes, deploys,
 * database drops, machine shutdowns) are intercepted before they reach the
 * agent: when an operator passphrase is configured, a destructive command must
 * carry it inline or the turn is refused. The passphrase is never hardcoded in
 * source (this repo is public) — it lives in Settings (OPERATOR_PHRASE,
 * stored encrypted at rest) or the MC_OPERATOR_PHRASE env var. With no phrase
 * configured the gate is inert, so nothing breaks until it is armed.
 */

/** Executable destructive operations the gate watches for. Kept explicit and
 *  predictable: these are the irreversible actions that deserve a second key.
 *  (Plain conversational mentions like "rm the stale code" also trip it — that
 *  is the point: the orb asks for the passphrase before acting on them.) */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  // Recursive / forced deletes
  /\brm\s+-[rf]+\b/, // rm -r, rm -rf
  /\brmdir\s+\/s\b/i, // Windows recursive rmdir
  /\bRemove-Item\b/i, // PowerShell
  /\bdel\s+\/s\b/i, // Windows recursive del
  // Git push / destructive reset
  /\bgit\s+push\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-[a-z]*[fxd]/,
  // Database drops
  /\bdrop\s+(database|table|schema|column)\b/i,
  // Machine-level ops
  /\b(shutdown|poweroff|reboot)\s+-[a-z]/i,
  /\bformat\s+[a-z]:/i,
  // Deploys (per the operator spec, deploy is gated like rm / git push)
  /\bdeploy\b/i,
];

/** True when the text contains an executable destructive operation. */
export function isDestructive(text: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(text));
}

/**
 * The gate: a destructive command is blocked unless the message carries the
 * operator passphrase. No passphrase configured → the gate is inert.
 */
export function operatorGateBlocked(message: string, phrase: string): boolean {
  const p = (phrase ?? "").trim();
  if (!p) return false;
  return isDestructive(message) && !message.includes(p);
}

/** The refusal message the orb surfaces when the gate trips. */
export function operatorGateMessage(): string {
  return (
    "🛡 Blocked — that command is destructive (delete / push / deploy / db-drop) and " +
    "needs the operator passphrase to run. Add it to your message, or disarm the " +
    "gate in Settings, then try again."
  );
}
