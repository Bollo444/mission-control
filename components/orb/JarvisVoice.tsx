"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hexA } from "@/lib/format";
import type { MicState } from "./OracleOrb";

/* The orb's voice. Type a line (or talk) and the orb answers; the reply streams
 * back over the orb turn endpoint (app/api/orb/turn). The orb's router picks a
 * Gemini backend per turn — the cheap 2.0 tier for simple asks, the capable 3.0
 * tier for complex ones — and delegates task execution to Hermes. Replies are
 * spoken sentence-by-sentence as they stream, and a new command (typed or
 * spoken) barges in: it cancels the in-flight turn and the current voice.
 *
 * Mic: the center of the orb is a translucent burgundy mic — the only mic
 * control (the bar no longer has one). Clicking it starts speech recognition.
 * Say the wake word — "hey jarvis" / "jarvis" / "hermes" — and a soft chime
 * sounds; whatever you say next is sent to the orb. Or just talk after tapping
 * the mic: the first utterance is treated as the command. */

const GOLD = "#f5b75a";

const WAKE_WORDS = ["hey jarvis", "ok jarvis", "jarvis", "hermes"];

// A user-set personal wake phrase — persisted, takes precedence over the defaults.
const WAKE_KEY = "mc.jarvis.wakephrase.v1";

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

interface RouteInfo {
  tier: string;
  model: string;
  reason: string;
}

/* A soft two-note wake chime, synthesized (no asset needed). */
function playWakeChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25]; // C5 → E5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.14;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.7);
    });
    // close the context after the notes finish
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio unavailable — wake silently */
  }
}

export default function JarvisVoice({
  onSpeaking,
  mic,
  onMicChange,
}: {
  onSpeaking: (b: boolean) => void;
  mic: MicState;
  onMicChange: (s: MicState) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Selected voice: "gemini:<Name>", "model:melotts" (Cloudflare neural) or
  // "browser:<voiceURI>". Defaults to Gemini's Charon until the user picks one.
  const [sel, setSel] = useState("gemini:Charon");
  // The routing decision for the current turn (Gemini 2.0 / 3.0 / Hermes).
  const [route, setRoute] = useState<RouteInfo | null>(null);
  // Personal wake phrase — the user can replace "hey jarvis" with anything.
  const [wakePhrase, setWakePhrase] = useState("");
  const [wakeDraft, setWakeDraft] = useState("");
  const [wakeSaved, setWakeSaved] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Default browser voice — a deeper English one for the Jarvis register.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<{ stop: () => void; start: () => void } | null>(null);

  const VOICE_KEY = "mc.jarvis.voice.v1";

  // Barge-in plumbing: each turn gets an id + an AbortController; a new turn
  // cancels the old stream and drops any speech still queued from it.
  const turnId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  // Sentence-streaming speech queue — serializes speak() calls so sentences
  // don't overlap, and checks turn id so aborted turns never speak.
  const speakChain = useRef<Promise<void>>(Promise.resolve());
  const spokenUpTo = useRef(0);

  // Restore the saved personal wake phrase.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WAKE_KEY);
      if (saved) setWakePhrase(saved);
    } catch {
      /* ignore */
    }
  }, []);

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

  // Keep the latest speak() reachable from the async stream loop.
  const speakRef = useRef(speak);
  speakRef.current = speak;

  // Enqueue complete sentences for speech, in order, without overlap. An
  // aborted turn's sentences resolve silently (turn-id guard).
  const queueSentences = useCallback((fullText: string, flush = false, myTurn = turnId.current) => {
    const pending = fullText.slice(spokenUpTo.current);
    const parts = pending.match(/[^.!?\n]+[.!?\n]*/g) ?? [];
    let consumed = 0;
    for (const part of parts) {
      const complete = /[.!?\n]/.test(part);
      if (!complete && !flush) break;
      consumed += part.length;
      const text = part.trim();
      if (text) {
        speakChain.current = speakChain.current.then(
          () =>
            new Promise<void>((resolve) => {
              if (turnId.current !== myTurn) {
                resolve();
                return;
              }
              speakRef.current(text, resolve);
            }),
        );
      }
    }
    spokenUpTo.current += consumed;
  }, []);

  // Silence any voice on unmount.
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      recRef.current?.stop();
    },
    [],
  );

  // Barge-in: cancel the in-flight turn and the current voice.
  const interrupt = useCallback(() => {
    abortRef.current?.abort();
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    audioRef.current?.pause();
    audioRef.current = null;
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Barge in: cancel whatever is running, then start this turn fresh.
      interrupt();
      const myTurn = ++turnId.current;
      spokenUpTo.current = 0;
      speakChain.current = Promise.resolve();

      setInput("");
      setRoute(null);
      setMsgs((m) => [...m, { who: "you", text: trimmed }, { who: "jarvis", text: "" }]);
      setBusy(true);
      onSpeaking(true);

      const ac = new AbortController();
      abortRef.current = ac;
      let full = "";
      const history = historyRef.current.slice(-12);
      try {
        const res = await fetch("/api/orb/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
          signal: ac.signal,
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
            let ev: { type: string; text?: string; message?: string; tier?: string; model?: string; reason?: string };
            try {
              ev = JSON.parse(line) as typeof ev;
            } catch {
              continue;
            }
            if (ev.type === "route") {
              setRoute({
                tier: ev.tier ?? "?",
                model: ev.model ?? "",
                reason: ev.reason ?? "",
              });
            } else if (ev.type === "chunk" && ev.text) {
              full += ev.text;
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { who: "jarvis", text: copy[copy.length - 1].text + ev.text };
                return copy;
              });
              queueSentences(full, false, myTurn);
            } else if (ev.type === "error") {
              setMsgs((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { who: "jarvis", text: `⚠ ${ev.message}` };
                return copy;
              });
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMsgs((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { who: "jarvis", text: `⚠ ${(e as Error).message}` };
            return copy;
          });
        }
      } finally {
        if (turnId.current === myTurn) {
          setBusy(false);
          // Flush any trailing (incomplete) sentence and settle the speech queue.
          queueSentences(full, true, myTurn);
          void speakChain.current.then(() => {
            if (turnId.current === myTurn) onSpeaking(false);
          });
          if (full) {
            historyRef.current = [
              ...historyRef.current,
              { role: "user" as const, content: trimmed },
              { role: "assistant" as const, content: full },
            ].slice(-24);
          }
        }
      }
    },
    [interrupt, onSpeaking, queueSentences],
  );

  const send = useCallback(async () => {
    await sendText(input);
  }, [input, sendText]);

  /* ---- Speech recognition (center mic + wake word) ---- */

  // Save a new personal wake phrase (the defaults stay as fallbacks).
  const saveWake = useCallback(() => {
    const p = wakeDraft.trim().toLowerCase().replace(/[.,!?]+$/, "");
    if (!p) return;
    setWakePhrase(p);
    setWakeDraft("");
    setWakeSaved(true);
    setTimeout(() => setWakeSaved(false), 1600);
    try {
      localStorage.setItem(WAKE_KEY, p);
    } catch {
      /* ignore */
    }
  }, [wakeDraft]);

  // Stop any running recognition.
  const stopRec = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
  }, []);

  // Start continuous recognition. In "wake" mode we wait for the wake word,
  // chime, then switch to "listen". In "listen" mode the next utterance is
  // the command.
  const startRec = useCallback(
    (mode: "wake" | "listen") => {
      type RecCtor = new () => {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        start: () => void;
        stop: () => void;
        onresult: ((e: {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        }) => void) | null;
        onerror: ((e: unknown) => void) | null;
        onend: (() => void) | null;
      };
      const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
      const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!SR) {
        onMicChange("off");
        return;
      }
      try {
        stopRec();
        const rec = new SR();
        rec.lang = "en-US";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => {
          let transcript = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) transcript += r[0].transcript;
          }
          const t = transcript.trim();
          if (!t) return;
          if (mode === "wake") {
            const lower = t.toLowerCase();
            // The personal phrase takes precedence; the built-ins stay as fallbacks.
            const wake = [wakePhrase, ...WAKE_WORDS].filter(Boolean).find((w) => lower.includes(w));
            if (wake) {
              playWakeChime();
              onMicChange("listen");
              // If the wake word came with a command attached ("hey jarvis, do X"),
              // strip it and send the rest.
              const rest = t.slice(t.toLowerCase().indexOf(wake) + wake.length).replace(/^[,.\s]+/, "");
              if (rest) {
                onMicChange("off");
                void sendText(rest);
              }
            }
          } else {
            // listen mode → the utterance is the command
            onMicChange("off");
            void sendText(t);
          }
        };
        rec.onerror = () => {
          // transient errors (no-speech etc.) — restart keeps it resilient
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          if (mic !== "off") {
            try {
              rec.start();
            } catch {
              onMicChange("off");
            }
          }
        };

        rec.onend = () => {
          // recognition ends when we stop it or on error; only auto-restart
          // while the mic is still supposed to be active
          if (mic !== "off" && micRef.current === mic) {
            try {
              rec.start();
            } catch {
              /* ignore */
            }
          }
        };
        recRef.current = rec;
        rec.start();
      } catch {
        onMicChange("off");
      }
    },
    [mic, onMicChange, sendText, stopRec, wakePhrase],
  );

  // Track the latest mic state so onend closures can check it without resubscribing.
  const micRef = useRef<MicState>(mic);
  micRef.current = mic;

  // Start/stop recognition whenever the mic state changes.
  useEffect(() => {
    if (mic === "off") {
      stopRec();
      return;
    }
    // small delay lets the UI settle before grabbing the mic
    const t = setTimeout(() => startRec(mic), mic === "listen" ? 0 : 250);
    return () => {
      clearTimeout(t);
    };
  }, [mic, startRec, stopRec]);

  return (
    <div className="mc-orb-bar pointer-events-none absolute inset-x-0 bottom-7 z-10 flex flex-col items-center gap-3 px-4">
      {/* Transcript — the current exchange, floating above the bar. */}
      {msgs.length > 0 && (
        <div
          className="pointer-events-auto max-h-[34vh] w-full max-w-2xl overflow-y-auto rounded-2xl px-4 py-3"
          style={{ background: "rgba(8,8,12,0.62)", backdropFilter: "blur(8px)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.25)}` }}
        >
          {route && (
            <div
              className="mb-2 flex flex-wrap items-baseline gap-x-2 font-mono text-[10px] uppercase tracking-[0.2em]"
              style={{ color: hexA(GOLD, 0.85) }}
            >
              <span>
                ◈ {route.tier === "hermes" ? "Hermes" : route.tier} · {route.model}
              </span>
              <span className="normal-case tracking-normal text-[var(--color-ink-4)]">{route.reason}</span>
            </div>
          )}
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
      <div className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
        {/* Personal wake phrase — set your own word to wake Jarvis. */}
        <div className="flex items-center gap-1.5">
          <input
            value={wakeDraft}
            onChange={(e) => setWakeDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveWake()}
            placeholder={`wake: "${wakePhrase || "hey jarvis"}"`}
            title="Set your own wake phrase — say it to wake the orb"
            aria-label="Custom wake phrase"
            className="w-40 truncate rounded-full px-3 py-1.5 text-[11px] outline-none"
            style={{ background: "rgba(8,8,12,0.8)", color: "var(--color-ink-2)", boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.35)}` }}
          />
          <button
            onClick={saveWake}
            disabled={!wakeDraft.trim()}
            className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-transform hover:-translate-y-px disabled:opacity-40"
            style={{ background: hexA(GOLD, 0.16), color: GOLD, boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}` }}
          >
            {wakeSaved ? "✓ saved" : "Set"}
          </button>
        </div>
        <select
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          title="Choose Jarvis's voice"
          className="max-w-[45%] truncate rounded-full px-3 py-1.5 text-[11px] outline-none"
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
