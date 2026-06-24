import { NextResponse } from "next/server";
import { getDiscordStatus, restartDiscordBot, postAsAgent } from "@/lib/discord";
import { writeSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — current bot status (configured/connected/tag/channel). */
export async function GET() {
  return NextResponse.json(getDiscordStatus());
}

/**
 * POST — manage the fleet bot.
 *   { action: "save", token?, channelId? }  -> persist creds + (re)connect
 *   { action: "reconnect" }                 -> restart with current config
 *   { action: "test", agentId, message }    -> post a test message as an agent
 */
export async function POST(req: Request) {
  let body: { action?: string; token?: string; channelId?: string; agentId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }

  if (body.action === "save") {
    const patch: Parameters<typeof writeSettings>[0] = {};
    if (typeof body.channelId === "string") patch.discordChannelId = body.channelId.trim();
    if (body.token && body.token.trim()) patch.apiKeys = { DISCORD_BOT_TOKEN: body.token.trim() };
    writeSettings(patch);
    const status = await restartDiscordBot();
    return NextResponse.json({ ok: true, status });
  }

  if (body.action === "reconnect") {
    const status = await restartDiscordBot();
    return NextResponse.json({ ok: true, status });
  }

  if (body.action === "test") {
    if (!body.agentId) return NextResponse.json({ ok: false, error: "agentId required" }, { status: 400 });
    const sent = await postAsAgent(body.agentId, body.message?.trim() || "Test message from Mission Control.");
    return NextResponse.json({ ok: sent, error: sent ? undefined : "bot not connected or channel not set" });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
