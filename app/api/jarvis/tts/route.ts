import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Jarvis voice — text → speech, tried in order:
 *   1. Google Gemini TTS (gemini-3.1-flash-tts-preview) — natural, free via an
 *      AI Studio key. Returns raw 24kHz/16-bit/mono PCM, which we wrap in a WAV
 *      header. Needs GEMINI_API_KEY.
 *   2. Cloudflare Workers AI MeloTTS — returns WAV. Needs CF token + account.
 *   3. (client) browser SpeechSynthesis — the offline-proof last resort.
 * Each rung falls through to the next on missing key / error.
 */

const GEMINI_MODEL = "gemini-3.1-flash-tts-preview";
const GEMINI_VOICE = "Charon"; // deep, measured — the Jarvis register

/** Prepend a 44-byte RIFF/WAVE header to raw PCM so browsers can play it. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function geminiTTS(
  text: string,
  voice: string,
  key: string,
  model: string = GEMINI_MODEL,
): Promise<Buffer | null> {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    },
  );
  if (!r.ok) return null;
  const j = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }>;
  };
  const b64 = j?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!b64) return null;
  return pcmToWav(Buffer.from(b64, "base64")); // Gemini returns 24kHz/16-bit/mono PCM
}

async function cloudflareTTS(text: string, lang: string, acct: string, token: string): Promise<Buffer | null> {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/@cf/myshell-ai/melotts`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ prompt: text, lang }),
    },
  );
  const j = (await r.json()) as { success?: boolean; result?: { audio?: string } };
  if (!r.ok || !j.success || !j.result?.audio) return null;
  return Buffer.from(j.result.audio, "base64"); // already WAV
}

export async function POST(req: Request) {
  let body: {
    text?: string;
    voice?: string;
    lang?: string;
    provider?: string;
    model?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const text = (body.text || "").trim().slice(0, 1200);
  if (!text) return NextResponse.json({ error: "empty text" }, { status: 400 });

  const keys = readSettings().apiKeys;
  const wav = (buf: Buffer) =>
    new Response(buf, { headers: { "content-type": "audio/wav", "cache-control": "no-store" } });

  // An explicit provider pins us to that engine; omitted → try Gemini then Melo.
  const provider = body.provider;
  const wantGemini = provider !== "melotts";
  const wantMelo = provider !== "gemini";

  // 1) Gemini
  const gemKey = keys.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  if (wantGemini && gemKey) {
    try {
      // An explicit model overrides the default (e.g. gemini-2.5-pro-preview-tts
      // for a higher-quality register). Same :generateContent REST + PCM shape.
      const model = body.model || GEMINI_MODEL;
      const out = await geminiTTS(text, body.voice || GEMINI_VOICE, gemKey, model);
      if (out) return wav(out);
    } catch {
      /* fall through */
    }
  }

  // 2) Cloudflare MeloTTS
  const acct = keys.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = keys.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
  if (wantMelo && acct && token) {
    try {
      const out = await cloudflareTTS(text, body.lang || "en", acct, token);
      if (out) return wav(out);
    } catch {
      /* fall through */
    }
  }

  // 3) nothing available → client drops to browser SpeechSynthesis
  return NextResponse.json({ error: "no tts provider available" }, { status: 502 });
}
