import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { splitForGroq, joinWavs } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Jarvis voice — text → speech, tried in order:
 *   1. Groq Orpheus (canopylabs/orpheus-v1-english) — OpenAI-compatible
 *      /v1/audio/speech, returns WAV directly. Free tier, no card; the endpoint
 *      caps each request at 200 chars, so text is chunked and re-stitched.
 *      Needs GROQ_API_KEY.
 *   2. Cloudflare Workers AI MeloTTS — returns WAV. Needs CF token + account.
 *   3. (client) browser SpeechSynthesis — the offline-proof last resort.
 * Each rung falls through to the next on missing key / error.
 */

const GROQ_MODEL = "canopylabs/orpheus-v1-english";
const GROQ_VOICE = "troy"; // warm, measured male — the Jarvis register

/**
 * Groq Orpheus — OpenAI-compatible /v1/audio/speech, returns WAV. Orpheus caps
 * each request at 200 input chars, so long text is split at sentence boundaries
 * and the per-chunk WAVs are stitched back into one response.
 */
async function groqTTS(
  text: string,
  voice: string,
  key: string,
  model: string = GROQ_MODEL,
): Promise<Buffer | null> {
  const chunks = splitForGroq(text);
  const wavs: Buffer[] = [];
  for (const chunk of chunks) {
    const r = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input: chunk, voice, response_format: "wav" }),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 44) return null;
    wavs.push(buf);
  }
  return wavs.length === 1 ? wavs[0] : joinWavs(wavs);
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

  // An explicit provider pins us to that engine; omitted → try Groq Orpheus,
  // then Melo.
  const provider = body.provider;
  const wantGroq = !provider || provider === "groq";
  const wantMelo = !provider || provider === "melotts";

  // 1) Groq Orpheus — free OpenAI-compatible neural voice
  const groqKey = keys.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (wantGroq && groqKey) {
    try {
      const out = await groqTTS(text, body.voice || GROQ_VOICE, groqKey);
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
