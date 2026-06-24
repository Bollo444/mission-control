import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  type Message,
  type TextChannel,
} from "discord.js";
import { AGENTS, getAgent, type AgentDef } from "./registry";
import { cascadeChat } from "./gateway";
import { readSettings } from "./settings";
import { logEvent } from "./logbook";

/* ------------------------------------------------------------------ *
 * One Discord bot, handed off to all 10 agents. Each agent "speaks" as *
 * an embed in its own accent color. Commands like `claude: <task>` are  *
 * routed to that agent through the free gateway and answered in-channel. *
 *                                                                       *
 * DORMANT BY DEFAULT: with no DISCORD_BOT_TOKEN configured, nothing      *
 * connects and nothing errors — the feature is entirely opt-in.         *
 * ------------------------------------------------------------------ */

interface BotStatus {
  configured: boolean;
  connected: boolean;
  botTag: string | null;
  channelId: string | null;
  error: string | null;
}

let client: Client | null = null;
let status: BotStatus = {
  configured: false,
  connected: false,
  botTag: null,
  channelId: null,
  error: null,
};

export function getDiscordStatus(): BotStatus {
  return { ...status };
}

function token(): string {
  return readSettings().apiKeys?.["DISCORD_BOT_TOKEN"] ?? "";
}

function accentInt(agent: AgentDef): number {
  const hex = agent.accent.replace("#", "");
  return parseInt(hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex, 16) || 0x888888;
}

/** Parse a channel message into a fleet command. Returns null to ignore. */
function parseCommand(
  content: string
): { kind: "help" } | { kind: "agent"; agent: AgentDef; task: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "help" || lower === "agents" || lower === "list") return { kind: "help" };

  // "<name>: task"  or  "<name> task"
  let name = "";
  let task = "";
  const colon = trimmed.indexOf(":");
  if (colon > 0 && colon <= 16) {
    name = trimmed.slice(0, colon).trim();
    task = trimmed.slice(colon + 1).trim();
  } else {
    const sp = trimmed.indexOf(" ");
    if (sp < 0) return null;
    name = trimmed.slice(0, sp).trim();
    task = trimmed.slice(sp + 1).trim();
  }
  const n = name.toLowerCase();
  const agent = AGENTS.find(
    (a) =>
      a.id.toLowerCase() === n ||
      a.name.toLowerCase() === n ||
      a.name.toLowerCase().split(" ")[0] === n
  );
  if (!agent || !task) return null;
  return { kind: "agent", agent, task };
}

function agentEmbed(agent: AgentDef, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(accentInt(agent))
    .setAuthor({ name: `${agent.glyph} ${agent.name}` })
    .setDescription(description.slice(0, 4000) || "—");
}

async function runAgentTask(agent: AgentDef, task: string): Promise<string> {
  try {
    const res = await cascadeChat(
      {
        model: "auto",
        messages: [
          {
            role: "system",
            content: `You are ${agent.name}, an agent in the Mission Control fleet (${agent.tagline}). Answer the user concisely and helpfully.`,
          },
          { role: "user", content: task },
        ],
        max_tokens: 700,
        temperature: 0.5,
      },
      { agentId: agent.id }
    );
    if (!res.ok) return `⚠ gateway error (${res.status}): ${res.error}`;
    const j = (await res.response.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: string } }> }
      | null;
    return j?.choices?.[0]?.message?.content?.trim() || "(no reply)";
  } catch (e) {
    return `⚠ ${(e as Error).message}`;
  }
}

async function handleMessage(msg: Message): Promise<void> {
  if (msg.author.bot) return;
  if (status.channelId && msg.channelId !== status.channelId) return;

  const cmd = parseCommand(msg.content);
  if (!cmd) return;

  const channel = msg.channel as TextChannel;
  if (cmd.kind === "help") {
    const list = AGENTS.map((a) => `**${a.name}** — \`${a.id}: <task>\``).join("\n");
    await channel
      .send({ embeds: [new EmbedBuilder().setColor(0xf5b75a).setTitle("Mission Control fleet").setDescription(list)] })
      .catch(() => {});
    return;
  }

  // Acknowledge, run, then reply as the agent in its color.
  await channel.sendTyping().catch(() => {});
  const reply = await runAgentTask(cmd.agent, cmd.task);
  await channel.send({ embeds: [agentEmbed(cmd.agent, reply)] }).catch(() => {});
  logEvent({ source: "discord", level: "info", event: `replied as ${cmd.agent.name}` });
}

/** Post a message in the configured channel as a given agent (its color). */
export async function postAsAgent(agentId: string, content: string): Promise<boolean> {
  const agent = getAgent(agentId);
  if (!client || !status.connected || !status.channelId || !agent) return false;
  try {
    const ch = await client.channels.fetch(status.channelId);
    if (!ch || !ch.isTextBased() || !("send" in ch)) return false;
    await (ch as TextChannel).send({ embeds: [agentEmbed(agent, content)] });
    return true;
  } catch {
    return false;
  }
}

/** Start the bot if a token is configured. Safe to call repeatedly. */
export async function startDiscordBot(): Promise<BotStatus> {
  const tok = token();
  status.channelId = readSettings().discordChannelId || null;
  if (!tok) {
    status = { configured: false, connected: false, botTag: null, channelId: status.channelId, error: null };
    return getDiscordStatus();
  }
  status.configured = true;
  if (client && status.connected) return getDiscordStatus();

  // Tear down any half-open client before reconnecting.
  if (client) {
    try { client.destroy(); } catch { /* ignore */ }
    client = null;
  }

  const c = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  c.once(Events.ClientReady, (ready) => {
    status.connected = true;
    status.botTag = ready.user.tag;
    status.error = null;
    logEvent({ source: "discord", level: "success", event: `bot online as ${ready.user.tag}` });
  });
  c.on(Events.MessageCreate, (m) => void handleMessage(m));
  c.on(Events.Error, (e) => {
    status.error = e.message;
  });

  try {
    await c.login(tok);
    client = c;
  } catch (e) {
    status.connected = false;
    status.error = (e as Error).message;
    logEvent({ source: "discord", level: "error", event: "bot login failed", detail: status.error });
  }
  return getDiscordStatus();
}

export async function stopDiscordBot(): Promise<void> {
  if (client) {
    try { client.destroy(); } catch { /* ignore */ }
    client = null;
  }
  status.connected = false;
  status.botTag = null;
}

export async function restartDiscordBot(): Promise<BotStatus> {
  await stopDiscordBot();
  return startDiscordBot();
}
