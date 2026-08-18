import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { transcribeWithGroq } from "@/lib/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The orb's browser-agnostic ear. When Google's Web Speech engine is refused
 * (non-Chrome browsers like Tabby/Edge get a `network` failure — Chrome-only
 * in practice), the client records the mic and posts the audio here; we
 * forward it to Groq Whisper (OpenAI-compatible) and return the transcript.
 * Same GROQ_API_KEY as the Orpheus voice — no Google involved.
 */

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || !file.size) {
    return NextResponse.json({ error: "no audio" }, { status: 400 });
  }
  if (file.size > 12 * 1024 * 1024) {
    return NextResponse.json({ error: "audio too large" }, { status: 413 });
  }

  const keys = readSettings().apiKeys;
  const key = keys.GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "no GROQ_API_KEY configured" }, { status: 502 });
  }

  const model = (form.get("model") as string | null) || undefined;
  const out = await transcribeWithGroq(key, file, model);
  if ("error" in out) {
    return NextResponse.json({ error: out.error }, { status: 502 });
  }
  return NextResponse.json({ text: out.text });
}
