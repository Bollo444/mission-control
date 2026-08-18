/*
 * Pure TTS helpers shared by the orb's voice route (app/api/jarvis/tts) and its
 * tests — no network calls, no Next.js imports.
 *
 * - pcmToWav: wrap raw PCM in a 44-byte RIFF/WAVE header so browsers can play it.
 * - splitForGroq: Groq's Orpheus endpoint caps each request at 200 input chars,
 *   so long text is split at sentence (then word) boundaries, hard-cutting only
 *   as a last resort.
 * - joinWavs: stitch the per-chunk WAV responses back into a single WAV.
 */

/** Groq's Orpheus endpoint rejects input longer than this. */
export const GROQ_MAX_CHARS = 200;

/** Prepend a 44-byte RIFF/WAVE header to raw PCM so browsers can play it. */
export function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
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

/**
 * Split text into ≤ GROQ_MAX_CHARS chunks, preferring sentence boundaries
 * (`. ! ? \n`), then word boundaries, then a hard cut. Whitespace-only pieces
 * are dropped.
 */
export function splitForGroq(text: string): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > GROQ_MAX_CHARS) {
    const window = rest.slice(0, GROQ_MAX_CHARS);
    let cut = -1;
    // Sentence boundary — the closest one to the 200-char limit.
    for (let i = window.length - 1; i > 0; i--) {
      const c = window[i];
      if (c === "." || c === "!" || c === "?" || c === "\n") {
        cut = i + 1;
        break;
      }
    }
    // Word boundary.
    if (cut < 0) {
      for (let i = window.length - 1; i > 0; i--) {
        if (/\s/.test(window[i])) {
          cut = i;
          break;
        }
      }
    }
    // Hard cut — no breakable boundary anywhere in the window.
    if (cut < 0) cut = GROQ_MAX_CHARS;
    const piece = rest.slice(0, cut).trim();
    if (piece) out.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

interface WavInfo {
  data: Buffer;
  sampleRate: number;
  channels: number;
  bits: number;
}

/** Locate the `data` chunk of a WAV and pull its format info. */
function wavInfo(wav: Buffer): WavInfo | null {
  if (
    wav.length < 44 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }
  const sampleRate = wav.readUInt32LE(24);
  const channels = wav.readUInt16LE(22);
  const bits = wav.readUInt16LE(34);
  // Walk RIFF chunks (word-aligned) to find `data` — robust to extra chunks
  // (LIST/bext/etc.) some providers prepend.
  let off = 12;
  while (off + 8 <= wav.length) {
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === "data") {
      return {
        data: wav.subarray(off + 8, off + 8 + size),
        sampleRate,
        channels,
        bits,
      };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

/**
 * Concatenate several WAV buffers into one valid WAV. Format (sample rate,
 * channels, bits) is taken from the first WAV; if none parses, the first input
 * is returned untouched.
 */
export function joinWavs(wavs: Buffer[]): Buffer {
  const parsed = wavs.map(wavInfo).filter((w): w is WavInfo => w !== null);
  if (!parsed.length) return wavs[0] ?? Buffer.alloc(0);
  const first = parsed[0];
  const pcm = Buffer.concat(parsed.map((w) => w.data));
  return pcmToWav(pcm, first.sampleRate, first.channels, first.bits);
}
