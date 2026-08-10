import fs from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MC_CONFIG_DIR } from "./paths";
import { readSettings } from "./settings";
import { decryptSecret, encryptSecret } from "./secretbox";

function privateIp(value: string): boolean {
  const ip = value.toLowerCase();
  if (net.isIP(ip) === 4) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === "::1" || ip === "::" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80:");
}

async function safeHttpUrl(value: string): Promise<URL> {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new Error("MCP HTTP transport requires HTTPS");
  if (parsed.username || parsed.password) throw new Error("MCP URL may not contain credentials");
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("MCP URL may not target local networks");
  }
  const addresses = net.isIP(host)
    ? [{ address: host }]
    : await dns.lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) {
    throw new Error("MCP URL may not target private networks");
  }
  return parsed;
}

export type McpTransport = "stdio" | "http";

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: any;
}

const MCP_CONFIG_FILE = path.join(MC_CONFIG_DIR, "mcp.json");

const DEFAULT_SERVERS: McpServerConfig[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."]
  },
  {
    id: "fetch",
    name: "Web fetch",
    enabled: false,
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-fetch"]
  },
  {
    id: "git",
    name: "Git",
    enabled: false,
    transport: "stdio",
    command: "uvx",
    args: ["mcp-server-git"]
  },
  {
    id: "memory",
    name: "Memory (KG)",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"]
  },
  {
    id: "sequentialthinking",
    name: "Sequential thinking",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  },
  {
    id: "github",
    name: "GitHub",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "" }
  },
  {
    id: "notion",
    name: "Notion",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: { NOTION_TOKEN: "" }
  },
  {
    id: "supabase",
    name: "Supabase",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@supabase/mcp-server-supabase", "--access-token="],
    env: { SUPABASE_ACCESS_TOKEN: "" }
  },
  {
    id: "postgres",
    name: "Postgres",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/postgres"]
  },
  {
    id: "brave-search",
    name: "Web search (Brave)",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "" }
  },
  {
    id: "slack",
    name: "Slack",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: { SLACK_BOT_TOKEN: "", SLACK_TEAM_ID: "" }
  },
  {
    id: "playwright",
    name: "Browser",
    enabled: false,
    transport: "stdio",
    command: "npx",
    args: ["-y", "@playwright/mcp"]
  }
];

const clientCache = new Map<string, Client>();

function mapSecrets(config: McpServerConfig, fn: (value: string) => string): McpServerConfig {
  return {
    ...config,
    env: config.env ? Object.fromEntries(Object.entries(config.env).map(([k, v]) => [k, fn(v)])) : config.env,
    headers: config.headers ? Object.fromEntries(Object.entries(config.headers).map(([k, v]) => [k, fn(v)])) : config.headers,
  };
}

export function listServers(): McpServerConfig[] {
  try {
    if (!fs.existsSync(MCP_CONFIG_FILE)) {
      saveServers(DEFAULT_SERVERS);
      return DEFAULT_SERVERS;
    }
    const raw = fs.readFileSync(MCP_CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is McpServerConfig => !!s && typeof s === "object" && typeof s.id === "string")
      .map((s) => mapSecrets(s, decryptSecret));
  } catch (e) {
    return [];
  }
}

export function saveServers(servers: McpServerConfig[]): void {
  fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(servers.map((s) => mapSecrets(s, encryptSecret)), null, 2), "utf8");
  try { fs.chmodSync(MCP_CONFIG_FILE, 0o600); } catch { /* Windows / unsupported filesystem */ }
}

export function getServer(id: string): McpServerConfig | undefined {
  return listServers().find(s => s.id === id);
}

export async function connect(id: string): Promise<Client> {
  const cached = clientCache.get(id);
  if (cached) return cached;

  const config = getServer(id);
  if (!config) throw new Error(`MCP server ${id} not found`);
  if (!config.enabled) throw new Error(`MCP server ${id} is disabled`);

  const client = new Client(
    { name: "MissionControl", version: "1.0.0" },
    { capabilities: {} }
  );

  let transport;
  if (config.transport === "stdio") {
    const isWin = process.platform === "win32";
    const commandName = path.basename(config.command || "").toLowerCase();
    if (commandName !== "npx" && commandName !== "uvx") throw new Error("unsupported MCP stdio command");
    if (!Array.isArray(config.args) || config.args.length > 32 || config.args.some((arg) => typeof arg !== "string" || arg.length > 512 || /^(-c|--eval|-e)$/.test(arg))) {
      throw new Error("invalid MCP stdio arguments");
    }
    let cmd = commandName;
    if (isWin) cmd += ".cmd";

    // Never pass Mission Control's complete process environment to an MCP
    // child: it may contain provider keys, the admin token, or host secrets.
    const settings = readSettings();
    const inherited: Record<string, string> = {};
    for (const name of ["PATH", "Path", "HOME", "USERPROFILE", "TEMP", "TMP", "SystemRoot", "ComSpec", "LANG", "TERM"]) {
      const value = process.env[name];
      if (value) inherited[name] = value;
    }
    const blocked = new Set(["MC_ADMIN_TOKEN", "MC_ENCRYPTION_KEY", "NODE_OPTIONS", "NODE_EXTRA_CA_CERTS", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "PATH", "Path", "HOME", "USERPROFILE"]);
    const configuredEnv = Object.fromEntries(
      Object.entries(config.env || {}).filter(([name, value]) =>
        /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !blocked.has(name) && typeof value === "string" && value.length <= 4096
      )
    );
    const env = { ...inherited, ...configuredEnv };
    // Only bridge this explicitly documented integration credential.
    if (!env.GITHUB_PERSONAL_ACCESS_TOKEN && settings.apiKeys.GITHUB_TOKEN) {
      env.GITHUB_PERSONAL_ACCESS_TOKEN = settings.apiKeys.GITHUB_TOKEN;
    }

    transport = new StdioClientTransport({
      command: cmd,
      args: config.args || [],
      env,
    });
  } else {
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
    const headers = Object.fromEntries(
      Object.entries(config.headers || {}).filter(([name, value]) =>
        /^[A-Za-z0-9-]+$/.test(name) && typeof value === "string" && value.length <= 4096
      )
    );
    transport = new SSEClientTransport(await safeHttpUrl(config.url || ""), {
      eventSourceInit: { headers } as any
    });
  }

  await client.connect(transport);
  clientCache.set(id, client);

  return client;
}

export async function listTools(id: string): Promise<McpTool[]> {
  const client = await connect(id);
  const result = await client.listTools();
  return result.tools as McpTool[];
}

export async function callTool(id: string, name: string, args: any): Promise<string> {
  const execute = async () => {
    const client = await connect(id);
    const result = await client.callTool({ name, arguments: args });
    const content = (result.content as any[]) || [];
    return content.map(c => {
      if (c.type === "text") return c.text;
      return JSON.stringify(c);
    }).join("\n");
  };

  try {
    return await execute();
  } catch (e) {
    // Retry once on failure
    clientCache.delete(id);
    try {
      return await execute();
    } catch (e2) {
      return `⚠ ${(e2 as Error).message}`;
    }
  }
}

export function closeAll(): void {
  for (const client of clientCache.values()) {
    try { client.close(); } catch {}
  }
  clientCache.clear();
}

export function redactConfig(config: McpServerConfig): McpServerConfig {
  const redacted = { ...config };
  if (redacted.env) {
    redacted.env = Object.fromEntries(
      Object.entries(redacted.env).map(([k, v]) => [k, v ? "••••" : ""])
    );
  }
  if (redacted.headers) {
    redacted.headers = Object.fromEntries(
      Object.entries(redacted.headers).map(([k, v]) => [k, v ? "••••" : ""])
    );
  }
  return redacted;
}
