import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeWithGroq, GROQ_STT_MODEL } from "../../lib/whisper";

/* The orb's browser-agnostic ear — Groq Whisper transcription. Non-Chrome
 * browsers (Tabby, Edge) are refused by Google's Web Speech service, so the
 * orb records the mic and transcribes here instead. */

describe("transcribeWithGroq", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the audio to Groq and returns the transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "what's the weather" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const file = new Blob(["fake-audio"], { type: "audio/webm" });
    const out = await transcribeWithGroq("gsk-test", file);

    expect(out).toEqual({ text: "what's the weather" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    expect(init.headers.Authorization).toBe("Bearer gsk-test");
    const fd = init.body as FormData;
    expect(fd.get("model")).toBe(GROQ_STT_MODEL);
    const sent = fd.get("file");
    expect(sent).toBeInstanceOf(Blob);
  });

  it("passes an explicit model through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribeWithGroq("k", new Blob(["x"]), "whisper-large-v3");
    const fd = fetchMock.mock.calls[0][1].body as FormData;
    expect(fd.get("model")).toBe("whisper-large-v3");
  });

  it("returns the Groq error when the API rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 })),
    );
    const out = await transcribeWithGroq("bad-key", new Blob(["x"]));
    expect("error" in out).toBe(true);
    if ("error" in out) expect(out.error).toContain("401");
  });

  it("returns a network error when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("failed to fetch")));
    const out = await transcribeWithGroq("k", new Blob(["x"]));
    expect(out).toEqual({ error: "network" });
  });

  it("tolerates a non-JSON success response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { status: 200 })));
    const out = await transcribeWithGroq("k", new Blob(["x"]));
    expect(out).toEqual({ text: "" });
  });
});
