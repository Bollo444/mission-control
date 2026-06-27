import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Jarvis voice — text → speech via a real audio model: Cloudflare Workers AI
 * MeloTTS (@cf/myshell-ai/melotts), which returns base64 MP3. If the key/account
 * is missing or Cloudflare errors, this 502s and the client drops to the
 * browser's built-in SpeechSynthesis — the offline-proof fallback rung.
 *
 * (Groq's PlayAI TTS was decommissioned; Groq now only does speech-to-text.)
 */

export async function POST(req: Request) {
  let body: { text?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const text = (body.text || "").trim().slice(0, 1200); // cap to keep latency sane
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });

  const keys = readSettings().apiKeys;
  const acct = keys.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = keys.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) {
    return NextResponse.json({ error: "Cloudflare token/account not configured" }, { status: 503 });
  }

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/myshell-ai/melotts`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt: text, lang: body.lang || "en" }),
      },
    );
    const j = (await r.json()) as { success?: boolean; result?: { audio?: string }; errors?: unknown };
    if (!r.ok || !j.success || !j.result?.audio) {
      return NextResponse.json(
        { error: "tts upstream", status: r.status, detail: JSON.stringify(j.errors ?? j).slice(0, 300) },
        { status: 502 },
      );
    }
    // MeloTTS returns base64 WAV (RIFF/PCM) audio.
    return new Response(Buffer.from(j.result.audio, "base64"), {
      headers: { "content-type": "audio/wav", "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
