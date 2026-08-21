import { describe, it, expect } from "vitest";
import { splitForGroq, joinWavs, pcmToWav, GROQ_MAX_CHARS, SpeechBatcher } from "../../lib/tts";

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

describe("SpeechBatcher", () => {
  it("releases a single complete sentence only on flush", () => {
    const b = new SpeechBatcher();
    // A short sentence alone is below the batching threshold — it must be
    // carried, not dropped, and only released when the reply ends.
    expect(b.push("Jarvis.")).toEqual({ utterances: [], consumed: 7 });
    expect(b.push("", true)).toEqual({ utterances: ["Jarvis."], consumed: 0 });
  });

  it("carries sentences across separate chunk calls and batches them", () => {
    const b = new SpeechBatcher();
    // Token-sized chunks, one complete sentence each (the delta carries the
    // inter-sentence space).
    const first = "Did you know that honey never spoils?";
    const second =
      " Archaeologists have found pots of honey in ancient Egyptian tombs that are over 3,000 years old and still perfectly edible.";
    expect(b.push(first)).toEqual({ utterances: [], consumed: first.length });
    // Second sentence completes a 2-sentence batch above 90 chars → released.
    const r = b.push(second);
    expect(r.utterances).toEqual([first + second]);
    expect(r.consumed).toBe(second.length);
  });

  it("never drops a consumed sentence — the flush releases the rest", () => {
    const b = new SpeechBatcher();
    // Mimic the component: it re-slices the accumulated reply by the batcher's
    // cursor, so chunk boundaries that leave an incomplete part re-feed it.
    let cursor = 0;
    const feed = (full: string, flush = false) => {
      const r = b.push(full.slice(cursor), flush);
      cursor += r.consumed;
      return r;
    };
    // Token-sized chunks, as the SSE stream delivers them.
    expect(feed("1,")).toEqual({ utterances: [], consumed: 0 }); // no .!?/\n terminator yet
    expect(feed("1, 2,")).toEqual({ utterances: [], consumed: 0 });
    expect(feed("1, 2, 3.")).toEqual({ utterances: [], consumed: 8 }); // now complete
    expect(cursor).toBe(8);
    expect(feed("1, 2, 3.", true)).toEqual({ utterances: ["1, 2, 3."], consumed: 0 });
  });

  it("does not consume an incomplete trailing sentence until it completes", () => {
    const b = new SpeechBatcher();
    let cursor = 0;
    const feed = (full: string, flush = false) => {
      const r = b.push(full.slice(cursor), flush);
      cursor += r.consumed;
      return r;
    };
    expect(feed("Hey the")).toEqual({ utterances: [], consumed: 0 });
    expect(feed("Hey there!")).toEqual({ utterances: [], consumed: 10 });
    expect(feed("Hey there!", true)).toEqual({ utterances: ["Hey there!"], consumed: 0 });
  });

  it("releases long single sentences at the 240-char threshold", () => {
    const b = new SpeechBatcher();
    const big = "A".repeat(120) + ". " + "B".repeat(130) + ".";
    const r = b.push(big);
    expect(r.utterances.length).toBe(1);
    expect(r.utterances[0]).toBe(big.trim());
  });

  it("flush on empty input releases nothing", () => {
    const b = new SpeechBatcher();
    expect(b.push("", true)).toEqual({ utterances: [], consumed: 0 });
  });

  it("reset clears the pending batch", () => {
    const b = new SpeechBatcher();
    b.push("Jarvis.");
    b.reset();
    expect(b.push("", true)).toEqual({ utterances: [], consumed: 0 });
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
