import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MC_CONFIG_DIR } from "./paths";
import { readSettings } from "./settings";

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

export function listServers(): McpServerConfig[] {
  try {
    if (!fs.existsSync(MCP_CONFIG_FILE)) {
      saveServers(DEFAULT_SERVERS);
      return DEFAULT_SERVERS;
    }
    const raw = fs.readFileSync(MCP_CONFIG_FILE, "utf8");
    return JSON.parse(raw) as McpServerConfig[];
  } catch (e) {
    return [];
  }
}

export function saveServers(servers: McpServerConfig[]): void {
  fs.mkdirSync(MC_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(MCP_CONFIG_FILE, JSON.stringify(servers, null, 2), "utf8");
}

export function getServer(id: string): McpServerConfig | undefined {
  return listServers().find(s => s.id === id);
}

export async function connect(id: string): Promise<Client> {
  const cached = clientCache.get(id);
  if (cached) return cached;

  const config = getServer(id);
  if (!config) throw new Error(`MCP server ${id} not found`);

  const client = new Client(
    { name: "MissionControl", version: "1.0.0" },
    { capabilities: {} }
  );

  let transport;
  if (config.transport === "stdio") {
    const isWin = process.platform === "win32";
    let cmd = config.command || "";
    if (isWin && (cmd === "npx" || cmd === "uvx")) cmd += ".cmd";

    // Resolve fleet keys in env
    const settings = readSettings();
    const env = { ...process.env, ...config.env };
    // Heuristic: if GITHUB_TOKEN is in fleet keys and not set in config, use it.
    if (!env.GITHUB_PERSONAL_ACCESS_TOKEN && settings.apiKeys.GITHUB_TOKEN) {
      env.GITHUB_PERSONAL_ACCESS_TOKEN = settings.apiKeys.GITHUB_TOKEN;
    }

    transport = new StdioClientTransport({
      command: cmd,
      args: config.args || [],
      env: env as Record<string, string>
    });
  } else {
    const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
    transport = new SSEClientTransport(new URL(config.url || ""), {
      eventSourceInit: {
        headers: config.headers
      } as any
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
