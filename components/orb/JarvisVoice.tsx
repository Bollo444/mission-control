"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hexA } from "@/lib/format";

/* The orb's voice. Type a line; Hermes answers and the reply streams back over
 * the ACP bridge (same backend the Duo flow uses). While a reply is streaming
 * we flag `speaking` so the orb's core quickens. */

const GOLD = "#f5b75a";

// All 30 Gemini TTS prebuilt voices — exposed in the picker as "gemini:<Name>".
const GEMINI_VOICES = [
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede",
  "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba",
  "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar",
  "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat",
];

interface Msg {
  who: "you" | "jarvis";
  text: string;
}

export default function JarvisVoice({ onSpeaking }: { onSpeaking: (b: boolean) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Selected voice: "gemini:<Name>", "model:melotts" (Cloudflare neural) or
  // "browser:<voiceURI>". Defaults to Gemini's Charon until the user picks one.
  const [sel, setSel] = useState("gemini:Charon");
  const endRef = useRef<HTMLDivElement>(null);
  // Default browser voice — a deeper English one for the Jarvis register.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const VOICE_KEY = "mc.jarvis.voice.v1";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Restore the saved voice choice.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_KEY);
      if (saved) setSel(saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist the choice whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(VOICE_KEY, sel);
    } catch {
      /* ignore */
    }
  }, [sel]);

  // Voices load asynchronously; populate the picker list and a good default.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const pick = () => {
      const vs = window.speechSynthesis.getVoices();
      if (!vs.length) return;
      setVoices(vs);
      const want = ["Daniel", "Google UK English Male", "Microsoft Guy", "Microsoft David", "Arthur", "en-GB"];
      voiceRef.current =
        want.map((n) => vs.find((v) => v.name.includes(n) || v.lang === n)).find(Boolean) ||
        vs.find((v) => v.lang.startsWith("en")) ||
        vs[0];
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", pick);
  }, []);

  // Browser-native speech — used directly when a browser voice is picked, and
  // as the always-available fallback for the model voice.
  const browserSpeak = useCallback((text: string, onDone: () => void, voice?: SpeechSynthesisVoice | null) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      onDone();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voice ?? voiceRef.current;
    if (v) u.voice = v;
    u.rate = 1;
    u.pitch = 0.9;
    u.onend = onDone;
    u.onerror = onDone;
    window.speechSynthesis.speak(u);
  }, []);

  // Speak a finished reply honoring the picked voice. A browser voice plays
  // directly; the model voice tries the audio endpoint then falls back to the
  // browser. onDone fires exactly once, when the voice actually stops.
  const speak = useCallback(
    async (text: string, onDone: () => void) => {
      if (muted || !text) {
        onDone();
        return;
      }
      // Browser voice chosen → speak it directly.
      if (sel.startsWith("browser:")) {
        const uri = sel.slice("browser:".length);
        browserSpeak(text, onDone, voices.find((v) => v.voiceURI === uri) ?? null);
        return;
      }
      // Neural providers (Gemini / MeloTTS) → audio endpoint, browser fallback.
      const reqBody = sel.startsWith("gemini:")
        ? { text, provider: "gemini", voice: sel.slice("gemini:".length) }
        : { text, provider: "melotts" };
      try {
        const res = await fetch("/api/jarvis/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(reqBody),
        });
        if (res.ok && (res.headers.get("content-type") || "").startsWith("audio")) {
          const url = URL.createObjectURL(await res.blob());
          const audio = new Audio(url);
          audioRef.current = audio;
          audio.onended = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            onDone();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            audioRef.current = null;
            browserSpeak(text, onDone); // model gave audio we can't play → browser
          };
          await audio.play();
          return;
        }
      } catch {
        /* network/abort → fall through to browser */
      }
      browserSpeak(text, onDone);
    },
    [muted, sel, voices, browserSpeak],
  );

  // Silence any voice on unmount.
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
    },
    [],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { who: "you", text }, { who: "jarvis", text: "" }]);
    setBusy(true);
    onSpeaking(true);
    let full = "";
    try {
      const res = await fetch("/api/hermes/acp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n\n")) >= 0) {
          const line = buf.slice(0, nl).replace(/^data: /, "").trim();
          buf = buf.slice(nl + 2);
          if (!line) continue;
          try {
            const ev = JSON.parse(line) as { type: string; text?: string; message?: string };
            if (ev.type === "chunk" && ev.text) {
              full += ev.text;
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { who: "jarvis", text: copy[copy.length - 1].text + ev.text };
                return copy;
              });
            } else if (ev.type === "error") {
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { who: "jarvis", text: `⚠ ${ev.message}` };
                return copy;
              });
            }
          } catch {
            /* ignore malformed frame */
          }
        }
      }
    } catch (e) {
      setMsgs((m) => {
        const copy = [...m];
        copy[copy.length - 1] = { who: "jarvis", text: `⚠ ${(e as Error).message}` };
        return copy;
      });
    } finally {
      setBusy(false);
      // Keep the orb "speaking" until the voice finishes (model audio or the
      // browser fallback); speak() always settles onSpeaking via the callback.
      void speak(full, () => onSpeaking(false));
    }
  }, [input, busy, onSpeaking, speak]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 flex flex-col items-center gap-3 px-4">
      {/* Transcript — the current exchange, floating above the bar. */}
      {msgs.length > 0 && (
        <div
          className="pointer-events-auto max-h-[34vh] w-full max-w-2xl overflow-y-auto rounded-2xl px-4 py-3"
          style={{ background: "rgba(8,8,12,0.62)", backdropFilter: "blur(8px)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.25)}` }}
        >
          <div className="flex flex-col gap-2.5">
            {msgs.map((m, i) => (
              <div key={i} className={m.who === "you" ? "self-end" : "self-start"}>
                {m.who === "jarvis" && (
                  <div className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: GOLD }}>
                    ◎ Jarvis
                  </div>
                )}
                <div
                  className="max-w-[80%] rounded-xl px-3.5 py-2 text-sm leading-relaxed"
                  style={
                    m.who === "you"
                      ? { background: GOLD, color: "#0b0c0f" }
                      : { background: hexA(GOLD, 0.1), color: "var(--color-ink)", border: `1px solid ${hexA(GOLD, 0.3)}` }
                  }
                >
                  {m.text || (busy ? "…" : "")}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* The bar. */}
      <div className="pointer-events-auto flex w-full max-w-xl items-center gap-2">
        <button
          onClick={() => {
            if (!muted) {
              window.speechSynthesis?.cancel(); // muting → stop talking now
              audioRef.current?.pause();
            }
            setMuted((v) => !v);
          }}
          title={muted ? "Voice off — click to let Jarvis speak" : "Voice on — click to mute"}
          aria-label={muted ? "Unmute Jarvis" : "Mute Jarvis"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg transition-transform hover:-translate-y-px"
          style={{ background: "rgba(8,8,12,0.7)", color: muted ? "var(--color-ink-4)" : GOLD, boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}`, backdropFilter: "blur(8px)" }}
        >
          {muted ? "🔇" : "🔊"}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Speak to Jarvis…"
          className="min-w-0 flex-1 rounded-full px-5 py-3 text-sm outline-none"
          style={{ background: "rgba(8,8,12,0.7)", color: "var(--color-ink)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}`, backdropFilter: "blur(8px)" }}
        />
        <button
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          className="rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:-translate-y-px disabled:opacity-40"
          style={{ background: GOLD, color: "#0b0c0f" }}
        >
          {busy ? "…" : "Speak"}
        </button>
      </div>
      <div className="pointer-events-auto flex w-full max-w-xl items-center justify-center gap-3">
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          title="Choose Jarvis's voice"
          className="max-w-[60%] truncate rounded-full px-3 py-1.5 text-[11px] outline-none"
          style={{ background: "rgba(8,8,12,0.8)", color: "var(--color-ink-2)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.35)}` }}
        >
          <optgroup label="Gemini (neural)">
            {GEMINI_VOICES.map((name) => (
              <option key={name} value={`gemini:${name}`}>
                ◎ {name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Neural model">
            <option value="model:melotts">🜂 MeloTTS · Cloudflare</option>
          </optgroup>
          {voices.length > 0 && (
            <optgroup label="Browser voices">
              {[...voices]
                .sort((a, b) => Number(b.lang.startsWith("en")) - Number(a.lang.startsWith("en")))
                .map((v) => (
                  <option key={v.voiceURI} value={`browser:${v.voiceURI}`}>
                    {v.name} · {v.lang}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
        <span className="hidden font-mono text-[10px] tracking-[0.25em] text-[var(--color-ink-4)] sm:inline">
          OR <span style={{ color: GOLD }}>/</span> FOR COMMANDS
        </span>
      </div>
    </div>
  );
}
