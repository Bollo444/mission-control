import { home } from "./paths";

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
  docsNote?: string;
}

export const AGENTS: AgentDef[] = [
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
  },
  {
    id: "hermes",
    name: "Hermes",
    tagline: "Agentic coding agent with a web console — autonomous task runs.",
    kind: "cli",
    accent: "#9d8cff",
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
      docs: "https://github.com/",
      unverified: true,
    },
    tools: [
      "Web console UI",
      "Autonomous task runs",
      "Multi-step planning",
      "Tool calling",
      "Session memory",
    ],
    docsNote:
      "Hermes is provisioned as a pluggable agent. Confirm the exact package/binary, then activate the install action on this page.",
  },
  {
    id: "pi",
    name: "Pi · PyAgents",
    tagline: "Python-native agent framework — composable, code-first agents.",
    kind: "framework",
    accent: "#5cd6a0",
    glyph: "π",
    primary: true,
    bin: "pi",
    binPaths: [home(".local", "bin", "pi.exe")],
    configPaths: [home(".pi", "config.toml"), home(".config", "pyagents")],
    configFormat: "toml",
    sessionsDir: home(".pi", "sessions"),
    sessionFormat: "generic",
    launch: { cmd: "pi", args: [], askCwd: true },
    install: {
      manager: "uv",
      command: "uv tool install pyagents",
      docs: "https://github.com/",
      unverified: true,
    },
    tools: [
      "Python-first agents",
      "Composable tools",
      "Async orchestration",
      "uv / pip managed",
      "Notebook friendly",
    ],
    docsNote:
      "Pi/PyAgents is provisioned as a pluggable Python agent. Confirm the exact package, then activate the install action.",
  },
  {
    id: "opencode",
    name: "OpenCode",
    tagline: "Open-source terminal coding agent — provider-agnostic.",
    kind: "cli",
    accent: "#f5b75a",
    glyph: "◍",
    primary: true,
    bin: "opencode",
    binPaths: [
      home(".opencode", "bin", "opencode.exe"),
      home("AppData", "Local", "Programs", "opencode", "opencode.exe"),
    ],
    configPaths: [
      home(".config", "opencode", "opencode.json"),
      home(".config", "opencode", "config.json"),
      home(".opencode"),
    ],
    configFormat: "json",
    sessionsDir: home(".local", "share", "opencode", "project"),
    sessionFormat: "generic",
    launch: { cmd: "opencode", args: [], askCwd: true },
    install: {
      manager: "npm",
      command: "npm install -g opencode-ai",
      docs: "https://opencode.ai",
    },
    tools: [
      "Provider-agnostic",
      "TUI client",
      "LSP integration",
      "Custom agents",
      "MCP support",
    ],
    homepage: "https://opencode.ai",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    tagline: "Agentic IDE (VS Code-based) + CLI and agent manager.",
    kind: "ide",
    accent: "#6ea8fe",
    glyph: "▲",
    primary: true,
    bin: "antigravity",
    binPaths: [
      home("AppData", "Local", "Programs", "Antigravity", "bin", "antigravity.cmd"),
    ],
    configPaths: [
      home(".antigravity", "argv.json"),
      home(".antigravity"),
      home(".antigravitycli"),
    ],
    configFormat: "json",
    sessionsDir: home(".antigravitycli"),
    sessionFormat: "generic",
    openCommand: {
      cmd: home("AppData", "Local", "Programs", "Antigravity", "bin", "antigravity.cmd"),
      args: [],
    },
    launch: { cmd: "antigravity", args: ["."], askCwd: true },
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
      home(".local", "bin", "openclaw.exe"),
      home(".openclaw", "bin", "openclaw.exe"),
      home("AppData", "Local", "Programs", "openclaw", "openclaw.exe"),
    ],
    configPaths: [home(".openclaw", "config.toml"), home(".openclaw")],
    configFormat: "toml",
    sessionsDir: home(".openclaw", "sessions"),
    sessionFormat: "generic",
    launch: { cmd: "openclaw", args: [], askCwd: true },
    install: {
      manager: "uv",
      command: "uv tool install openclaw",
      docs: "https://github.com/",
      unverified: true,
    },
    tools: [
      "Autonomous refactors",
      "Multi-repo grappling",
      "Parallel task swarm",
      "Dependency surgery",
      "Self-healing retries",
      "Diff-first edits",
    ],
    docsNote:
      "OpenClaw is provisioned as a pluggable autonomous agent. Confirm the exact package/binary, then activate the install action on this page.",
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
    id: "kilo",
    name: "Kilo Code",
    tagline: "Open-source AI coding agent (VS Code / config-driven).",
    kind: "framework",
    accent: "#c0c6d4",
    glyph: "◈",
    primary: false,
    bin: "kilo",
    configPaths: [home(".config", "kilo")],
    configFormat: "dir",
    sessionFormat: "none",
    install: { manager: "vscode", command: "", docs: "https://kilocode.ai" },
    tools: ["VS Code extension", "Custom modes", "MCP", "Config-driven"],
  },
];

export function getAgent(id: string): AgentDef | undefined {
  return AGENTS.find((a) => a.id === id);
}

export const PRIMARY_AGENTS = AGENTS.filter((a) => a.primary);
