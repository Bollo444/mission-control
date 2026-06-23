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
  docsNote?: string;
}

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
    id: "opencode",
    name: "OpenCode",
    tagline: "Open-source terminal coding agent — provider-agnostic.",
    kind: "cli",
    accent: "#9d8cff",
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
      home("AppData", "Roaming", "npm", "openclaw.cmd"),
      home(".local", "bin", "openclaw.exe"),
    ],
    configPaths: [home(".openclaw", "openclaw.json"), home(".openclaw")],
    configFormat: "json",
    sessionsDir: home(".openclaw", "workspace"),
    sessionFormat: "generic",
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
    id: "kilo",
    name: "Kilo Code",
    tagline: "Open-source agentic coding CLI — 500+ models, free tier; VS Code & JetBrains too.",
    kind: "cli",
    accent: "#c0c6d4",
    glyph: "◈",
    primary: false,
    bin: "kilo",
    binPaths: [
      home("AppData", "Roaming", "npm", "kilo.cmd"),
      home(".local", "bin", "kilo.exe"),
    ],
    configPaths: [home(".config", "kilo"), home(".kilocode")],
    configFormat: "dir",
    sessionFormat: "none",
    launch: { cmd: "kilo", args: [], askCwd: true },
    install: { manager: "npm", command: "npm install -g @kilocode/cli", docs: "https://kilo.ai/cli" },
    homepage: "https://kilo.ai",
    tools: ["CLI agent", "Free models (500+)", "Custom modes", "MCP", "VS Code / JetBrains"],
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
