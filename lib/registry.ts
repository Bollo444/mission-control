import { home, repo } from "./paths";

export type AgentKind = "cli" | "ide" | "framework";
export type ConfigFormat = "toml" | "json" | "dir" | "none";
export type SessionFormat = "claude" | "jcode" | "vibe" | "generic" | "none";

export interface InstallSpec {
  manager: string;
  command: string;
  docs?: string;
  /** True when we cannot positively verify the canonical package; surface a warning. */
  unverified?: boolean;
}

export interface LaunchSpec {
  /** Command + args launched in a new terminal window. */
  cmd: string;
  args: string[];
  /** When true the launcher asks for a working directory first. */
  askCwd?: boolean;
}

export interface AgentDef {
  id: string;
  name: string;
  tagline: string;
  kind: AgentKind;
  /** Per-agent identity color (hex). The global UI accent stays singular. */
  accent: string;
  glyph: string;
  /** Whether this is one of the five primary agents the user named. */
  primary: boolean;

  /** Command name to resolve on PATH. */
  bin?: string;
  /** Absolute candidate binary paths, checked before PATH resolution. */
  binPaths?: string[];

  /** Config files/dirs to surface. */
  configPaths?: string[];
  configFormat?: ConfigFormat;

  sessionsDir?: string;
  sessionFormat?: SessionFormat;

  launch?: LaunchSpec;
  /** IDE agents open an application rather than a terminal. */
  openCommand?: { cmd: string; args: string[] };

  install?: InstallSpec;

  /** Capabilities surfaced on the agent's mission-control page. */
  tools: string[];
  homepage?: string;
  /** Agent's add-on marketplace (plugins/skills/extensions), if it has one. */
  marketplace?: string;
  docsNote?: string;
}

/**
 * Antigravity IDE (a VS Code fork) CLI shim. Installed as "Antigravity IDE"
 * (note the space) with a standard VS Code CLI at bin/antigravity-ide.cmd —
 * opens files/folders in the real IDE, manages extensions, tunnel, etc.
 */
const ANTIGRAVITY_CLI = home(
  "AppData",
  "Local",
  "Programs",
  "Antigravity IDE",
  "bin",
  "antigravity-ide.cmd"
);

/** Launcher for the local Sentinel security swarm (workspace under ./sentinel). */
const SENTINEL_LAUNCHER =
  process.platform === "win32"
    ? repo("sentinel", "run-sentinel.cmd")
    : repo("sentinel", "run-sentinel.sh");

export const AGENTS: AgentDef[] = [
  {
    id: "hermes",
    name: "Hermes",
    tagline: "Nous Research's self-improving coding agent — builds & refines skills, runs anywhere.",
    kind: "cli",
    accent: "#f5b75a",
    glyph: "⬢",
    primary: true,
    bin: "hermes",
    binPaths: [home(".local", "bin", "hermes.exe")],
    configPaths: [home(".hermes", "config.toml"), home(".hermes")],
    configFormat: "toml",
    sessionsDir: home(".hermes", "sessions"),
    sessionFormat: "generic",
    launch: { cmd: "hermes", args: [], askCwd: true },
    install: {
      manager: "uv",
      command: "uv tool install hermes-agent",
      docs: "https://nousresearch.com",
    },
    tools: [
      "Self-improving skills",
      "Autonomous task runs",
      "Multi-step planning",
      "Tool calling",
      "Session memory",
      "ACP (hermes-acp)",
    ],
    docsNote:
      "Installed via Nous Research's hermes-agent (provides the `hermes` CLI). Route it to the Nous provider and set NOUS_API_KEY for free Hermes models.",
  },
  {
    id: "claude",
    name: "Claude Code",
    tagline: "Anthropic's agentic coding CLI — subagents, skills, MCP, hooks.",
    kind: "cli",
    accent: "#e0915f",
    glyph: "✻",
    primary: true,
    bin: "claude",
    binPaths: [home(".local", "bin", "claude.exe")],
    configPaths: [
      home(".claude", "settings.json"),
      home(".claude", "CLAUDE.md"),
      home(".claude.json"),
    ],
    configFormat: "json",
    sessionsDir: home(".claude", "projects"),
    sessionFormat: "claude",
    launch: { cmd: "claude", args: [], askCwd: true },
    install: {
      manager: "native",
      command: "irm https://claude.ai/install.ps1 | iex",
      docs: "https://docs.claude.com/en/docs/claude-code",
    },
    tools: [
      "Subagents",
      "Skills",
      "MCP servers",
      "Hooks",
      "Persistent memory",
      "Plan mode",
      "Slash commands",
    ],
    homepage: "https://claude.com/claude-code",
    marketplace: "https://github.com/anthropics/claude-plugins-official",
  },
  {
    id: "pi",
    name: "Pi",
    tagline: "Earendil's AI agent toolkit — coding-agent CLI + unified multi-provider LLM API.",
    kind: "cli",
    accent: "#5cd6a0",
    glyph: "π",
    primary: true,
    bin: "pi",
    binPaths: [
      home("AppData", "Roaming", "npm", "pi.cmd"),
      home(".local", "bin", "pi.exe"),
    ],
    configPaths: [home(".pi"), home(".config", "pi")],
    configFormat: "dir",
    sessionsDir: home(".pi", "sessions"),
    sessionFormat: "generic",
    launch: { cmd: "pi", args: [], askCwd: true },
    install: {
      manager: "npm",
      command: "npm install -g @earendil-works/pi-coding-agent",
      docs: "https://github.com/earendil-works/pi",
    },
    homepage: "https://github.com/earendil-works/pi",
    tools: [
      "Coding-agent CLI",
      "Unified LLM API",
      "TUI & web UI",
      "Multi-provider",
      "Slack bot",
      "vLLM pods",
    ],
    docsNote:
      "Installed from @earendil-works/pi-coding-agent (provides the `pi` CLI). Ships a unified multi-provider LLM API (OpenAI / Anthropic / Google).",
  },
  {
    id: "cline",
    name: "Cline",
    tagline: "Headless autonomous coding agent — CLI + SDK + parallel worktrees.",
    kind: "cli",
    accent: "#9d8cff",
    glyph: "◆",
    primary: true,
    bin: "cline",
    binPaths: [
      home("AppData", "Roaming", "npm", "cline.cmd"),
      home(".local", "bin", "cline.exe"),
      home("AppData", "Local", "Programs", "cline", "cline.exe"),
    ],
    configPaths: [home(".cline", "config.json"), home(".cline")],
    configFormat: "json",
    sessionsDir: home(".local", "share", "cline", "sessions"),
    sessionFormat: "generic",
    launch: { cmd: "cline", args: [], askCwd: true },
    openCommand: { cmd: "cline", args: ["-i"] },
    install: {
      manager: "npm",
      command: "npm install -g cline",
      docs: "https://cline.ai",
      unverified: false,
    },
    tools: [
      "Headless CLI",
      "Parallel agent board",
      "MCP servers",
      "Provider-agnostic",
      "Git auto-commit",
      "JSON output",
    ],
    homepage: "https://cline.ai",
    marketplace: "https://github.com/cline/cline",
    docsNote:
      "Headless autonomous coding agent. Install with `npm install -g cline`, then run `cline \"<task>\"` for headless zero-interaction dispatch — provider-agnostic, routes through the Fleet Gateway. Use `cline -i` for the interactive TUI.",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    tagline: "Agentic IDE (VS Code-based) + CLI and agent manager.",
    kind: "ide",
    accent: "#6ea8fe",
    glyph: "▲",
    primary: true,
    bin: "agy",
    binPaths: [
      home("AppData", "Local", "agy", "bin", "agy.exe"),
      home("AppData", "Local", "agy", "agy.exe"),
      home("AppData", "Roaming", "npm", "agy.cmd"),
    ],
    configPaths: [
      home(".antigravity", "argv.json"),
      home(".antigravity"),
      home(".antigravitycli"),
    ],
    configFormat: "json",
    sessionsDir: home(".antigravitycli"),
    // A symlink to Gemini config, not chat sessions — don't count/list as sessions.
    sessionFormat: "none",
    openCommand: {
      cmd: ANTIGRAVITY_CLI,
      args: [],
    },
    launch: { cmd: "agy", args: [], askCwd: true },
    install: {
      manager: "native",
      command: "winget install Google.Antigravity",
      docs: "https://antigravity.google",
    },
    tools: [
      "Agentic IDE",
      "Extensions",
      "CLI launcher",
      "Agent manager",
      "Inline editing",
    ],
    homepage: "https://antigravity.google",
    marketplace: "https://open-vsx.org/",
  },
  {
    id: "zcode",
    name: "ZCode",
    tagline: "GLM-powered desktop coding IDE (Electron).",
    kind: "ide",
    accent: "#f04d8b",
    glyph: "✦",
    primary: false,
    bin: "zcode",
    binPaths: [
      home("AppData", "Local", "Programs", "ZCode", "ZCode.exe"),
      home("AppData", "Local", "Programs", "ZCode", "zcode.exe"),
    ],
    configPaths: [home(".zcode", "v2", "settings.json"), home(".zcode")],
    configFormat: "json",
    // ZCode is a stateless launcher (no chat sessions to aggregate) — don't count/list.
    sessionFormat: "none",
    openCommand: {
      cmd: home("AppData", "Local", "Programs", "ZCode", "ZCode.exe"),
      args: [],
    },
    launch: {
      cmd: home("AppData", "Local", "Programs", "ZCode", "ZCode.exe"),
      args: [],
      askCwd: false,
    },
    install: {
      manager: "manual",
      command: "Download from zcode.com",
      docs: "https://zcode.com",
    },
    tools: [
      "GLM autocomplete",
      "Skill plugins",
      "MCP servers",
      "Built-in terminal",
    ],
    homepage: "https://zcode.com",
    docsNote:
      "A second desktop IDE launcher alongside Antigravity. No meeting seat, no telemetry loop — surfaces on /overview + the Antigravity IDE panel as an 'Open in ZCode' escape hatch.",
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    tagline: "Autonomous grappling agent — seizes tasks, refactors at scale, ships diffs.",
    kind: "cli",
    accent: "#ff4438",
    glyph: "⌖",
    primary: true,
    bin: "openclaw",
    binPaths: [
      home("AppData", "Roaming", "npm", "openclaw.cmd"),
      home(".local", "bin", "openclaw.exe"),
    ],
    configPaths: [home(".openclaw", "openclaw.json"), home(".openclaw")],
    configFormat: "json",
    sessionsDir: home(".openclaw", "workspace"),
    // A real git workspace, not chat sessions — don't count/list as sessions.
    sessionFormat: "none",
    launch: { cmd: "openclaw", args: [], askCwd: true },
    install: {
      manager: "npm",
      command: "npm install -g openclaw@latest",
      docs: "https://github.com/openclaw/openclaw",
    },
    homepage: "https://github.com/openclaw/openclaw",
    tools: [
      "Autonomous refactors",
      "Multi-repo grappling",
      "Parallel task swarm",
      "Dependency surgery",
      "Self-healing retries",
      "Diff-first edits",
    ],
    docsNote:
      "Bound to openclaw (steipete) — installed via npm, config at ~/.openclaw/openclaw.json. Heads-up: the real openclaw is a local-first personal-assistant gateway, which differs from this agent's system-ops fleet persona.",
  },

  // --- Bonus: real coding agents already present on this machine ---
  {
    id: "jcode",
    name: "jcode",
    tagline: "Terminal agent with swarm + ambient mode and memory.",
    kind: "cli",
    accent: "#46e0d0",
    glyph: "◆",
    primary: false,
    bin: "jcode",
    binPaths: [home("AppData", "Local", "jcode", "bin", "jcode.exe")],
    configPaths: [home(".jcode", "config.toml"), home(".jcode", "servers.json")],
    configFormat: "toml",
    sessionsDir: home(".jcode", "sessions"),
    sessionFormat: "jcode",
    launch: { cmd: "jcode", args: [], askCwd: true },
    install: { manager: "native", command: "", docs: "" },
    tools: ["Swarm agents", "Ambient mode", "Memory", "Web search", "MCP", "Compaction"],
  },
  {
    id: "vibe",
    name: "Vibe",
    tagline: "Mistral's coding CLI — voice mode, local + cloud models.",
    kind: "cli",
    accent: "#f06a7a",
    glyph: "❖",
    primary: false,
    bin: "vibe",
    binPaths: [home(".local", "bin", "vibe.exe")],
    configPaths: [home(".vibe", "config.toml")],
    configFormat: "toml",
    sessionsDir: home(".vibe", "logs", "session"),
    sessionFormat: "vibe",
    launch: { cmd: "vibe", args: [], askCwd: true },
    install: { manager: "native", command: "", docs: "" },
    tools: ["Voice mode", "Local models", "Skills", "Agents", "Connectors", "TTS"],
  },
  {
    id: "codex",
    name: "Codex",
    tagline: "OpenAI's agentic coding CLI — plugins, MCP, cloud tasks, sandboxed exec & code review.",
    kind: "cli",
    accent: "#10a37f",
    glyph: "▰",
    primary: false,
    bin: "codex",
    binPaths: [
      home("AppData", "Roaming", "npm", "codex.cmd"),
      home(".local", "bin", "codex.exe"),
    ],
    configPaths: [home(".codex", "config.toml"), home(".codex", "AGENTS.md")],
    configFormat: "toml",
    sessionsDir: home(".codex", "sessions"),
    sessionFormat: "generic",
    launch: { cmd: "codex", args: [], askCwd: true },
    install: { manager: "npm", command: "npm install -g @openai/codex", docs: "https://developers.openai.com/codex/cli" },
    homepage: "https://openai.com/codex",
    tools: ["Native TUI", "Plugins / apps library", "MCP servers", "Codex Cloud", "Code review", "Sandboxed exec", "Sessions (resume/fork)"],
  },

  // --- Local security swarm (gitignored workspace under ./sentinel) ---
  {
    id: "sentinel",
    name: "Sentinel",
    tagline:
      "Local security operator — 754 cyber-skill playbooks; recon → vuln → hunt → IR → malware → reporting, on free models.",
    kind: "cli",
    accent: "#d65db1",
    glyph: "⬡",
    primary: false,
    binPaths: [SENTINEL_LAUNCHER],
    configPaths: [repo("sentinel", ".claude", "skills")],
    configFormat: "dir",
    sessionFormat: "none",
    launch: {
      cmd:
        process.platform === "win32"
          ? `"${SENTINEL_LAUNCHER}"`
          : `bash "${SENTINEL_LAUNCHER}"`,
      args: [],
      askCwd: false,
    },
    tools: [
      "Recon & OSINT",
      "Vulnerability assessment",
      "Threat hunting",
      "Incident response",
      "Malware analysis",
      "754 skill playbooks",
    ],
    docsNote:
      "A local, gitignored security swarm under ./sentinel (a fresh OpenSwarm fork + 754 Anthropic cybersecurity skills, free model via LiteLLM). Launch runs ./sentinel/run-sentinel.cmd. Setup is local — see sentinel/README.local.md. Authorized targets only.",
  },
];

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

export const PRIMARY_AGENTS = AGENTS.filter((a) => a.primary);
