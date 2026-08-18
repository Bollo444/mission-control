import { describe, it, expect } from "vitest";
import { splitForGroq, joinWavs, pcmToWav, GROQ_MAX_CHARS } from "../../lib/tts";

describe("splitForGroq", () => {
  it("returns the text as-is when within the 200-char limit", () => {
    expect(splitForGroq("Hello world.")).toEqual(["Hello world."]);
    expect(splitForGroq("A".repeat(GROQ_MAX_CHARS))).toEqual(["A".repeat(GROQ_MAX_CHARS)]);
  });

  it("splits long text at sentence boundaries", () => {
    const long = "A".repeat(150) + ". " + "B".repeat(150) + ".";
    const parts = splitForGroq(long);
    expect(parts.length).toBe(2);
    expect(parts[0].endsWith(".")).toBe(true);
    expect(parts.every((p) => p.length <= GROQ_MAX_CHARS)).toBe(true);
  });

  it("falls back to word boundaries when no sentence break fits", () => {
    const words = Array.from({ length: 60 }, () => "word").join(" "); // ~300 chars, no punctuation
    const parts = splitForGroq(words);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= GROQ_MAX_CHARS)).toBe(true);
    // No word was split mid-way.
    expect(parts.every((p) => /^word(\sword)*$/.test(p.trim()))).toBe(true);
  });

  it("hard-cuts text with no breakable boundaries", () => {
    const noBreak = "x".repeat(450);
    const parts = splitForGroq(noBreak);
    expect(parts.length).toBe(3);
    expect(parts.every((p) => p.length <= GROQ_MAX_CHARS)).toBe(true);
  });

  it("handles empty / whitespace-only input", () => {
    expect(splitForGroq("")).toEqual([]);
    expect(splitForGroq("   \n  ")).toEqual([]);
  });
});

describe("pcmToWav / joinWavs", () => {
  it("pcmToWav produces a valid WAV header", () => {
    const wav = pcmToWav(Buffer.alloc(1600), 48000, 1, 16);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt32LE(24)).toBe(48000);
    expect(wav.length).toBe(44 + 1600);
  });

  it("joinWavs concatenates multiple WAVs into one", () => {
    const a = pcmToWav(Buffer.alloc(400), 48000, 1, 16);
    const b = pcmToWav(Buffer.alloc(600), 48000, 1, 16);
    const joined = joinWavs([a, b]);
    expect(joined.toString("ascii", 0, 4)).toBe("RIFF");
    expect(joined.readUInt32LE(24)).toBe(48000);
    expect(joined.length).toBe(44 + 1000);
  });

  it("joinWavs tolerates extra RIFF chunks before data", () => {
    // Simulate a WAV with a well-formed LIST chunk between fmt and data.
    const pcm = Buffer.alloc(800);
    const base = pcmToWav(pcm, 48000, 1, 16);
    const list = Buffer.alloc(16);
    list.write("LIST", 0);
    list.writeUInt32LE(8, 4); // LIST payload: one 8-byte sub-chunk
    list.write("INAM", 8);
    list.writeUInt32LE(0, 12); // sub-chunk with no data
    const withList = Buffer.concat([base.subarray(0, 44), list, base.subarray(44)]);
    // Fix up the RIFF size to cover the extra chunk.
    withList.writeUInt32LE(withList.length - 8, 4);
    const joined = joinWavs([withList, base]);
    expect(joined.length).toBe(44 + 1600);
  });

  it("joinWavs returns the input when it cannot parse any WAV", () => {
    const junk = Buffer.from("not a wav at all");
    expect(joinWavs([junk])).toEqual(junk);
  });
});
