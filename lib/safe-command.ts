/**
 * Parse a command line without invoking a shell. Shell operators, redirects,
 * substitutions, and newlines are rejected rather than interpreted.
 */
export function parseSafeCommand(command: string): [string, string[]] | null {
  const source = command.trim();
  if (!source || source.length > 2000 || /[;&|<>`$()\n\r]/.test(source)) return null;

  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const ch of source) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (escaped || quote) return null;
  if (current) tokens.push(current);
  if (!tokens.length || !isReadOnlyCommand(tokens)) return null;
  return [tokens[0], tokens.slice(1)];
}

/**
 * Automation may expose diagnostics, not a general-purpose process launcher.
 * Keep this list intentionally small and reject flags/arguments that could turn
 * a read-only command into a script runner or a file mutation.
 */
function isReadOnlyCommand(tokens: string[]): boolean {
  const [command, ...args] = tokens;
  const name = command.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const allowed: Record<string, string[][]> = {
    pwd: [[]],
    whoami: [[]],
    hostname: [[]],
    uname: [["-a"]],
    node: [["--version"], ["-v"]],
    npm: [["--version"], ["-v"]],
    bun: [["--version"], ["-v"]],
    git: [["--version"], ["version"], ["status"], ["status", "--short"], ["branch", "--show-current"], ["log", "-1", "--oneline"]],
  };
  return (allowed[name] ?? []).some((accepted) => accepted.length === args.length && accepted.every((v, i) => v === args[i]));
}
