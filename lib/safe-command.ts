import path from "node:path";
import fs from "node:fs";

/**
 * Parse a command line without invoking a shell. Shell operators, redirects,
 * substitutions, and newlines are rejected rather than interpreted, and the
 * command may not itself be a shell or a code evaluator — those would let a
 * structured command line escape back into arbitrary execution. Anything else
 * (one binary + args) is allowed: the admin boundary (MC_ADMIN_TOKEN) is the
 * trust gate for who can schedule jobs or run flows; this parser only
 * guarantees the command runs as written, not that the command is harmless.
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
  if (!tokens.length) return null;

  const [binary, ...args] = tokens;
  const name = path.basename(binary).toLowerCase();
  // A nested shell would re-interpret the arguments we just parsed. Reject it.
  if (SHELL_BINARIES.has(name)) return null;
  // Interpreters with an eval flag run source code from the command line — the
  // second way a string escapes into arbitrary execution. Reject those flags.
  const evalFlags = EVAL_FLAGS[name];
  if (evalFlags && args.some((arg) => evalFlags.includes(arg))) return null;
  return [binary, args];
}

/** Shells can re-interpret anything we pass them; never let automation spawn one. */
const SHELL_BINARIES = new Set([
  "sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish",
  "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe",
]);

/** Code-eval flags per interpreter. Args are compared exactly (no "-c" blanket). */
const EVAL_FLAGS: Record<string, string[]> = {
  node: ["-e", "--eval", "-p", "--print", "-i", "--interactive"],
  bun: ["-e", "--eval"],
  deno: ["eval", "-e", "-p"],
  python: ["-c", "--command"],
  python3: ["-c"],
  py: ["-c", "-Command"],
  perl: ["-e"],
  ruby: ["-e"],
  php: ["-r", "-R"],
  npx: ["-c", "--call"],
  "npx.cmd": ["-c", "--call"],
};

/**
 * Windows .cmd/.bat shims (npm.cmd, gh.exe, …) need their real extension
 * resolved before spawn(…, { shell: false }) can launch them. Returns an
 * absolute path when the binary is found on PATH, else the original name so
 * spawn surfaces the ENOENT.
 */
export function resolveCommandBinary(name: string): string {
  const pathValue = process.env.PATH || process.env.Path || "";
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  const candidates = [name];
  if (process.platform === "win32" && !/\.[A-Za-z0-9]{1,4}$/.test(name)) {
    candidates.push(name + ".exe", name + ".cmd", name + ".bat");
  }
  for (const dir of dirs) {
    for (const candidate of candidates) {
      try {
        fs.accessSync(path.join(dir, candidate));
        return path.join(dir, candidate);
      } catch {
        /* not in this dir — keep looking */
      }
    }
  }
  return name;
}
