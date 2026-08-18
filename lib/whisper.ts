/*
 * Groq Whisper — the orb's browser-agnostic ear.
 *
 * Google's Web Speech recognition is effectively Chrome-only: non-Chrome
 * browsers (Tabby, Edge, other Chromium forks) get their connection to the
 * recognition service refused, which the browser reports as a `network`
 * error. When that engine is missing or refused, the orb records the mic
 * in the browser and transcribes the audio here instead — an
 * OpenAI-compatible /v1/audio/transcriptions call, authenticated with the
 * same GROQ_API_KEY as the Orpheus voice. No Google involved, so the orb
 * hears in any browser with a mic.
 */

export const GROQ_STT_MODEL = "whisper-large-v3-turbo";

export type TranscribeResult = { text: string } | { error: string };

export async function transcribeWithGroq(
  key: string,
  file: Blob,
  model: string = GROQ_STT_MODEL,
): Promise<TranscribeResult> {
  const body = new FormData();
  body.append("model", model);
  // .webm matches the MediaRecorder output of Chromium browsers; Groq's
  // Whisper accepts webm/opus directly.
  body.append("file", file, "speech.webm");

  let r: Response;
  try {
    r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body,
    });
  } catch {
    return { error: "network" };
  }
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    return { error: `groq ${r.status}: ${detail.slice(0, 160)}` };
  }
  const j = (await r.json().catch(() => null)) as { text?: string } | null;
  return { text: j?.text ?? "" };
}
