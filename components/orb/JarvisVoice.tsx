"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hexA } from "@/lib/format";
import type { MicState } from "./OracleOrb";

/* The orb's voice. Type a line (or talk) and the orb answers; the reply streams
 * back over the orb turn endpoint (app/api/orb/turn). The orb's router picks a
 * Groq backend per turn — the fast tier for simple asks, the capable tier for
 * complex ones — and delegates task execution to Hermes. Replies are
 * spoken sentence-by-sentence as they stream, and a new command (typed or
 * spoken) barges in: it cancels the in-flight turn and the current voice.
 *
 * Mic: the center of the orb is a translucent burgundy mic — the only mic
 * control (the bar no longer has one). Clicking it starts speech recognition.
 * Say the wake word — "hey jarvis" / "jarvis" / "hermes" — and a soft chime
 * sounds; whatever you say next is sent to the orb. Or just talk after tapping
 * the mic: the first utterance is treated as the command. Flip the hands-free
 * chip and the orb listens for the wake word on its own — no tap required; it
 * re-arms after every reply.
 *
 * Listening engine: Google's Web Speech recognition is Chrome-only in
 * practice — non-Chrome browsers (Tabby, Edge, other Chromium forks) get
 * their connection refused, surfacing as a `network` error. When that engine
 * is missing or refused, the orb switches to the Whisper fallback: the mic is
 * recorded in-browser and transcribed by Groq Whisper via /api/orb/transcribe
 * (same GROQ_API_KEY as the Orpheus voice). Tap the orb to record, tap again
 * to send; hands-free wake works too, via a segment loop listening for the
 * wake word. */

export type ListenEngine = "google" | "whisper";

/* Google's Web Speech recognition is Chrome-only in practice: non-Chrome
 * browsers (Tabby, Edge, other Chromium forks) get their connection refused —
 * which usually surfaces as a `network` error but can also hang silently with
 * no error and no recognition. Detect up front so those browsers skip the
 * doomed Google attempt and start straight on the Whisper engine. */
function isGoogleChrome(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (!/Chrome\//.test(ua)) return false;
  return !/(Edg|OPR|Brave|Tabby|Opera|Electron|Vivaldi|YaBrowser)/i.test(ua);
}

const GOLD = "#f5b75a";

const WAKE_WORDS = ["hey jarvis", "ok jarvis", "jarvis", "hermes"];

// A user-set personal wake phrase — persisted, takes precedence over the defaults.
const WAKE_KEY = "mc.jarvis.wakephrase.v1";
// Hands-free wake: the orb listens for the wake word without pressing the mic.
const HANDSFREE_KEY = "mc.jarvis.handsfree.v1";

// Groq Orpheus voices — exposed in the picker as "groq:<voiceId>" (lowercase).
// Male voices first so the deep Jarvis register sits on top, mirroring the
// Gemini list's Charon default. Free tier, no card — needs GROQ_API_KEY.
const ORPHEUS_VOICES = ["Troy", "Austin", "Daniel", "Autumn", "Hannah", "Diana"];

// Whisper fallback STT model (Groq) — the browser-agnostic listening engine.
const WHISPER_MODEL = "whisper-large-v3-turbo";
// Command capture caps (whisper engine): hard ceiling for push-to-talk, and
// the shorter auto-send for hands-free (a reply can be tapped early).
const FB_MAX_MS = 30000;
const FB_HANDSFREE_MS = 8000;
// Hands-free wake segment length — this often the orb transcribes while it
// listens for the wake word on its own.
const FB_SEGMENT_MS = 5000;

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
  onEngine,
}: {
  onSpeaking: (b: boolean) => void;
  mic: MicState;
  onMicChange: (s: MicState) => void;
  /** Notifies the stage which listening engine is active (drives the hint). */
  onEngine?: (engine: ListenEngine) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  // Selected voice: "groq:<voiceId>" (Groq Orpheus), "model:melotts" (Cloudflare
  // neural) or "browser:<voiceURI>". Defaults to Troy — the deep Jarvis
  // register — until the user picks one.
  const [sel, setSel] = useState("groq:troy");
  // The routing decision for the current turn (Gemini 2.0 / 3.0 / Hermes).
  const [route, setRoute] = useState<RouteInfo | null>(null);
  // Personal wake phrase — the user can replace "hey jarvis" with anything.
  const [wakePhrase, setWakePhrase] = useState("");
  const [wakeDraft, setWakeDraft] = useState("");
  const [wakeSaved, setWakeSaved] = useState(false);
  // Hands-free wake — the orb always listens for the wake word, no mic tap.
  const [handsFree, setHandsFree] = useState(false);
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  // Voice-offline cooldown: after a `network` failure the wake mic is NOT
  // error-looped — attempts are suppressed for a bit before re-arming. The
  // user's hands-free setting is preserved through the outage.
  const netRetryAt = useRef(0);
  // True while a turn reply is being spoken — the wake mic stands down so the
  // orb never hears its own voice and re-triggers (echo) mid-reply.
  const [talking, setTalking] = useState(false);
  // Transient notice when the mic can't arm. The reason is surfaced so the
  // message tells the truth: unsupported browser, mic permission blocked, or
  // the recognition service itself unreachable (VPN / proxy) — not a generic
  // "blocked or unsupported" that sends the user chasing the wrong fix.
  type VoiceDenyReason = "unsupported" | "permission" | "network" | "other";
  const [voiceDenied, setVoiceDenied] = useState<VoiceDenyReason | null>(null);
  const voiceDeniedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // The transcript's own scroll container — auto-scroll stays *inside* it, so
  // new chunks never scroll the window (which pushed the centered orb off the
  // top of the screen, especially in immersive mode where the bar is translated
  // off-stage).
  const transcriptRef = useRef<HTMLDivElement>(null);
  // Default browser voice — a deeper English one for the Jarvis register.
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  // ---- Whisper fallback engine (browser-agnostic listening) state. ----
  // Active listening engine: "google" (Web Speech) or "whisper" (record the
  // mic, transcribe with Groq Whisper). Non-Chrome browsers start on whisper
  // directly (Google's service refuses them — or hangs silently); Chrome keeps
  // the fast path and only switches if the engine errors.
  const [engine, setEngine] = useState<ListenEngine>(() =>
    isGoogleChrome() ? "google" : "whisper",
  );
  const engineRef = useRef(engine);
  engineRef.current = engine;
  // Transient whisper-engine status line (empty transcript, transcribe errors).
  const [fbNotice, setFbNotice] = useState<string | null>(null);
  const fbNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fbStreamRef = useRef<MediaStream | null>(null);
  const fbStreamPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const fbCaptureRef = useRef<{
    rec: MediaRecorder;
    chunks: Blob[];
    send: boolean; // true = command capture (transcribe + send), false = wake segment
    startedAt: number;
  } | null>(null);
  const fbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Restore + persist the hands-free setting.
  useEffect(() => {
    try {
      if (localStorage.getItem(HANDSFREE_KEY) === "1") setHandsFree(true);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(HANDSFREE_KEY, handsFree ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [handsFree]);

  useEffect(() => {
    const c = transcriptRef.current;
    if (c) c.scrollTop = c.scrollHeight;
  }, [msgs]);

  // Restore the saved voice choice. Gemini voices are gone — any legacy
  // "gemini:*" pref migrates to the default Troy.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VOICE_KEY);
      if (saved) setSel(saved.startsWith("gemini:") ? "groq:troy" : saved);
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
      // Neural providers (Groq Orpheus / MeloTTS) → audio endpoint, browser fallback.
      const reqBody = sel.startsWith("groq:")
        ? { text, provider: "groq", voice: sel.slice("groq:".length) }
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
  //
  // Sentences are *batched* into slightly larger utterances (a couple of
  // sentences, up to ~240 chars) before being spoken: per-sentence TTS round
  // trips produce that choppy, start-stop "robotic" cadence — every clause
  // restarts the engine. Batching gives the voice a continuous run.
  const queueSentences = useCallback((fullText: string, flush = false, myTurn = turnId.current) => {
    const pending = fullText.slice(spokenUpTo.current);
    const parts = pending.match(/[^.!?\n]+[.!?\n]*/g) ?? [];
    let consumed = 0;
    let batch = "";
    const enqueue = (text: string) => {
      const t = text.trim();
      if (!t) return;
      speakChain.current = speakChain.current.then(
        () =>
          new Promise<void>((resolve) => {
            if (turnId.current !== myTurn) {
              resolve();
              return;
            }
            speakRef.current(t, resolve);
          }),
      );
    };
    for (const part of parts) {
      const complete = /[.!?\n]/.test(part);
      if (!complete && !flush) break;
      consumed += part.length;
      batch += part;
      const sentences = (batch.match(/[.!?\n]/g) ?? []).length;
      if (batch.trim().length >= 240 || (sentences >= 2 && batch.trim().length >= 90)) {
        enqueue(batch);
        batch = "";
      }
    }
    if (flush && batch.trim()) enqueue(batch);
    spokenUpTo.current += consumed;
  }, []);

  // Silence any voice on unmount.
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
      recRef.current?.stop();
      stopFb();
      if (voiceDeniedTimer.current) clearTimeout(voiceDeniedTimer.current);
      if (fbNoticeTimer.current) clearTimeout(fbNoticeTimer.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only; refs/stable callbacks
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
      // Stand the wake mic down for the whole turn (echo guard).
      setTalking(true);

      const ac = new AbortController();
      abortRef.current = ac;
      let full = "";
      const history = historyRef.current.slice(-12);
      // Share the client-resolved location (the same one the weather panel
      // persists) so the orb's weather tool answers for where you actually are.
      let lat: number | undefined;
      let lon: number | undefined;
      try {
        const saved = localStorage.getItem("mc.weather.loc");
        if (saved) {
          const loc = JSON.parse(saved) as { lat?: number; lon?: number };
          if (typeof loc.lat === "number" && typeof loc.lon === "number") {
            lat = loc.lat;
            lon = loc.lon;
          }
        }
      } catch {
        /* no saved location — tool falls back to defaults */
      }
      try {
        const res = await fetch("/api/orb/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: trimmed, history, lat, lon }),
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
            if (turnId.current === myTurn) {
              onSpeaking(false);
              // Reply done — hands-free re-arms the wake mic.
              setTalking(false);
            }
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

  // Surface a short-lived "voice unavailable" hint instead of a silent no-op
  // when the mic can't start, saying WHICH failure it is (unsupported browser,
  // permission blocked, or the recognition service unreachable over the
  // network — e.g. behind a VPN/proxy). Auto-clears after a few seconds.
  const flagVoiceDenied = useCallback((reason: VoiceDenyReason) => {
    setVoiceDenied(reason);
    if (voiceDeniedTimer.current) clearTimeout(voiceDeniedTimer.current);
    voiceDeniedTimer.current = setTimeout(() => setVoiceDenied(null), 6000);
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
        // No Web Speech engine at all — fall back to Whisper transcription.
        setEngine("whisper");
        onEngine?.("whisper");
        flagVoiceDenied("unsupported");
        onMicChange("off");
        return;
      }
      // Service unreachable — hold off until the cooldown expires; the
      // retryNonce bump re-invokes this effect and tries again.
      if (Date.now() < netRetryAt.current) return;
      try {
        stopRec();
        // A fresh attempt clears any stale notice — it only reappears if this
        // attempt actually fails.
        setVoiceDenied(null);
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
        rec.onerror = (e) => {
          const err = (e as { error?: string }).error;
          // Mic permission denied → stop and drop hands-free rather than
          // looping on the same error forever.
          if (err === "not-allowed" || err === "service-not-allowed") {
            flagVoiceDenied("permission");
            onMicChange("off");
            setHandsFree(false);
            return;
          }
          // Speech engine unreachable (VPN/proxy/network blocks the
          // recognition backend). Non-Chrome browsers (Tabby, Edge, …) get
          // this refusal by design — switch to the Whisper fallback rather
          // than looping on it; the engine change re-arms the right path.
          if (err === "network") {
            setEngine("whisper");
            onEngine?.("whisper");
            flagVoiceDenied("network");
            if (micRef.current !== "off") onMicChange("off");
            return;
          }
          // transient errors (no-speech, aborted, audio-capture …) — restart
          // keeps it resilient
          try {
            rec.stop();
          } catch {
            /* ignore */
          }
          if (micRef.current !== "off" || handsFreeRef.current) {
            try {
              rec.start();
            } catch {
              flagVoiceDenied("other");
              onMicChange("off");
            }
          }
        };

        rec.onend = () => {
          // A newer session (or an explicit stop) replaced us — don't restart.
          if (recRef.current !== rec) return;
          // Voice offline cooldown — don't immediately re-attempt a dead service.
          if (Date.now() < netRetryAt.current) return;
          // recognition ends when we stop it or on error; only auto-restart
          // while the mic is still supposed to be active — including the
          // hands-free wake mic at mic "off"
          if (micRef.current !== "off" || handsFreeRef.current) {
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
        flagVoiceDenied("other");
        onMicChange("off");
      }
    },
    [mic, onMicChange, onEngine, sendText, stopRec, wakePhrase, flagVoiceDenied],
  );

  // Track the latest mic state so onend closures can check it without resubscribing.
  const micRef = useRef<MicState>(mic);
  micRef.current = mic;

  /* ---- Whisper fallback engine (browser-agnostic listening) ----
   * When Google's Web Speech engine is missing or refused (non-Chrome
   * Chromium browsers get a `network` failure), we record the mic and
   * transcribe with Groq Whisper through /api/orb/transcribe. Push-to-talk
   * (tap the orb, speak, tap again) and hands-free (segment loop listening
   * for the wake word) both work in any browser with a mic. */

  // POST a recorded blob → transcript. Errors are returned, not thrown.
  const whisperTranscribe = useCallback(
    async (blob: Blob): Promise<{ text: string } | { error: string }> => {
      const fd = new FormData();
      fd.append("file", blob, "speech.webm");
      fd.append("model", WHISPER_MODEL);
      let res: Response;
      try {
        res = await fetch("/api/orb/transcribe", { method: "POST", body: fd });
      } catch {
        return { error: "network" };
      }
      const j = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!res.ok || !j) return { error: j?.error ?? `HTTP ${res.status}` };
      return { text: j.text ?? "" };
    },
    [],
  );

  // Short-lived status line for the whisper engine.
  const showFbNotice = useCallback((msg: string) => {
    setFbNotice(msg);
    if (fbNoticeTimer.current) clearTimeout(fbNoticeTimer.current);
    fbNoticeTimer.current = setTimeout(() => setFbNotice(null), 5000);
  }, []);

  // Sync the stage hint with the engine picked at mount, and tell non-Chrome
  // users once that the orb is listening via Whisper (Google's service refuses
  // their browser).
  useEffect(() => {
    onEngine?.(engineRef.current);
    if (engineRef.current === "whisper" && !isGoogleChrome()) {
      showFbNotice("Using Whisper transcription (Groq) — works in any browser.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // One mic stream for the whole whisper session — acquired once (and shared
  // by concurrent requests), released when listening stops.
  const acquireStream = useCallback((): Promise<MediaStream | null> => {
    if (fbStreamRef.current) return Promise.resolve(fbStreamRef.current);
    if (!fbStreamPromiseRef.current) {
      fbStreamPromiseRef.current = navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((s) => {
          fbStreamRef.current = s;
          return s;
        })
        .catch((e: unknown) => {
          const name = (e as DOMException)?.name;
          if (name === "NotAllowedError" || name === "PermissionDeniedError") {
            flagVoiceDenied("permission");
            setHandsFree(false);
          } else {
            flagVoiceDenied("other");
          }
          onMicChange("off");
          return null;
        })
        .finally(() => {
          fbStreamPromiseRef.current = null;
        });
    }
    return fbStreamPromiseRef.current;
  }, [flagVoiceDenied, onMicChange]);

  const releaseStream = useCallback(() => {
    fbStreamRef.current?.getTracks().forEach((t) => t.stop());
    fbStreamRef.current = null;
  }, []);

  // Stop everything (talking guard / engine off / unmount) — pending captures
  // are discarded (their onstop bails on the ref mismatch).
  const stopFb = useCallback(() => {
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
    fbTimerRef.current = null;
    const cap = fbCaptureRef.current;
    fbCaptureRef.current = null;
    try {
      cap?.rec.stop();
    } catch {
      /* ignore */
    }
    releaseStream();
  }, [releaseStream]);

  // Tap-off during a command capture → stop and send what was said. A wake
  // segment tap-off just aborts.
  const stopFbTapOff = useCallback(() => {
    const cap = fbCaptureRef.current;
    if (!cap) return;
    if (cap.send) {
      try {
        cap.rec.stop(); // onstop → transcribe + send
      } catch {
        /* ignore */
      }
    } else {
      stopFb();
    }
  }, [stopFb]);

  // Record until the next tap (or the cap), then transcribe and send.
  const startFbCommand = useCallback(
    async (handsFree: boolean) => {
      if (fbCaptureRef.current) return;
      const stream = await acquireStream();
      if (!stream) return;
      let rec: MediaRecorder;
      try {
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
          MediaRecorder.isTypeSupported(m),
        );
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        flagVoiceDenied("other");
        onMicChange("off");
        return;
      }
      const chunks: Blob[] = [];
      const cap = { rec, chunks, send: true, startedAt: Date.now() };
      fbCaptureRef.current = cap;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        if (fbCaptureRef.current !== cap) return; // aborted or superseded
        fbCaptureRef.current = null;
        releaseStream();
        void (async () => {
          const blob = new Blob(chunks, { type: rec.mimeType });
          const out = await whisperTranscribe(blob);
          onMicChange("off");
          if ("error" in out) {
            showFbNotice("Couldn't reach the transcription service — check your Groq key in Settings.");
            return;
          }
          const text = out.text.trim();
          if (!text) {
            showFbNotice("Didn't catch that — tap the orb and try again.");
            return;
          }
          void sendText(text);
        })();
      };
      rec.start();
      fbTimerRef.current = setTimeout(() => {
        if (fbCaptureRef.current === cap) {
          try {
            cap.rec.stop();
          } catch {
            /* ignore */
          }
        }
      }, handsFree ? FB_HANDSFREE_MS : FB_MAX_MS);
    },
    [acquireStream, flagVoiceDenied, onMicChange, releaseStream, sendText, showFbNotice, whisperTranscribe],
  );

  // One hands-free wake segment — records ~5s, transcribes, and either finds
  // the wake word (chime → listen for the command) or schedules the next one.
  const fbWakeSegment = useCallback(async () => {
    if (fbCaptureRef.current) return;
    const stream = await acquireStream();
    if (!stream) return;
    let rec: MediaRecorder;
    try {
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) =>
        MediaRecorder.isTypeSupported(m),
      );
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      return;
    }
    const chunks: Blob[] = [];
    const cap = { rec, chunks, send: false, startedAt: Date.now() };
    fbCaptureRef.current = cap;
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      if (fbCaptureRef.current !== cap) return; // superseded (tap / command)
      fbCaptureRef.current = null;
      void (async () => {
        const blob = new Blob(chunks, { type: rec.mimeType });
        const out = await whisperTranscribe(blob);
        // The loop only continues while hands-free is still on, the engine is
        // still whisper, and nothing else grabbed the mic.
        if (!handsFreeRef.current || engineRef.current !== "whisper") return;
        if (fbCaptureRef.current?.send) return; // a command capture superseded us
        const raw = "error" in out ? "" : out.text.trim();
        const lower = raw.toLowerCase();
        const wake = [wakePhrase, ...WAKE_WORDS].filter(Boolean).find((w) => lower.includes(w));
        if (wake) {
          playWakeChime();
          const rest = raw.slice(lower.indexOf(wake) + wake.length).replace(/^[.,\s]+/, "");
          if (rest) {
            onMicChange("off");
            void sendText(rest);
          } else {
            onMicChange("listen"); // command capture arms via the mic effect
          }
        } else if (handsFreeRef.current && engineRef.current === "whisper") {
          fbTimerRef.current = setTimeout(() => void fbWakeSegment(), 200);
        }
      })();
    };
    rec.start();
    fbTimerRef.current = setTimeout(() => {
      if (fbCaptureRef.current === cap) {
        try {
          cap.rec.stop();
        } catch {
          /* ignore */
        }
      }
    }, FB_SEGMENT_MS);
  }, [acquireStream, onMicChange, playWakeChime, sendText, wakePhrase, whisperTranscribe]);

  // Entry point for the whisper engine, driven by the mic effect below.
  const startFb = useCallback(
    (mode: "command" | "wakeLoop") => {
      if (mode === "command") {
        if (fbCaptureRef.current?.send) return; // already capturing a command
        void startFbCommand(handsFreeRef.current);
      } else {
        void fbWakeSegment();
      }
    },
    [startFbCommand, fbWakeSegment],
  );

  // Start/stop recognition whenever the mic state changes. While hands-free is
  // on the wake mic also runs at mic "off" (wake listening, no tap), and it
  // stands down entirely while a reply is being spoken so the orb never hears
  // its own voice (echo re-trigger). The active engine — google Web Speech or
  // the whisper fallback — picks the implementation.
  useEffect(() => {
    if (talking) {
      stopRec();
      stopFb();
      return;
    }
    if (mic === "off" && !handsFree) {
      stopRec();
      // Whisper push-to-talk: tap-off = stop and send the captured audio.
      if (engineRef.current === "whisper") stopFbTapOff();
      else stopFb();
      return;
    }
    // small delay lets the UI settle before grabbing the mic
    const t = setTimeout(() => {
      if (engineRef.current === "whisper") {
        // Tap = command capture; hands-free at mic "off" runs the wake loop.
        startFb(mic === "off" ? "wakeLoop" : "command");
      } else {
        startRec(mic === "off" ? "wake" : mic);
      }
    }, mic === "listen" ? 0 : 250);
    return () => {
      clearTimeout(t);
    };
  }, [mic, handsFree, talking, engine, startRec, stopRec, startFb, stopFb, stopFbTapOff]);

  return (
    <div className="mc-orb-bar pointer-events-none absolute inset-x-0 bottom-7 z-10 flex flex-col items-center gap-3 px-4">
      {/* Mic couldn't arm — say why instead of failing silently. The reason
          (unsupported / permission / network) tells the user which fix to try;
          unsupported and network also mean we switched to the Whisper engine. */}
      {voiceDenied && (
        <div
          className="pointer-events-none rounded-full px-3 py-1.5 font-mono text-[11px]"
          style={{
            background: "rgba(8,8,12,0.8)",
            color: hexA(GOLD, 0.9),
            boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}`,
            backdropFilter: "blur(8px)",
          }}
        >
          {voiceDenied === "unsupported"
            ? "◉ No speech engine in this browser — switched to Whisper transcription. Tap the orb and speak."
            : voiceDenied === "permission"
              ? "◉ Mic permission blocked — allow the microphone for this site, then tap the orb again. Type meanwhile."
              : voiceDenied === "network"
                ? "◉ Google's speech service is refused here (Chrome-only) — switched to Whisper transcription. Tap the orb and speak."
                : "◉ Voice unavailable here — mic blocked or unsupported. Type your command instead."}
        </div>
      )}
      {/* Whisper-engine status (empty transcript, transcribe errors). */}
      {!voiceDenied && fbNotice && (
        <div
          className="pointer-events-none rounded-full px-3 py-1.5 font-mono text-[11px]"
          style={{
            background: "rgba(8,8,12,0.8)",
            color: hexA(GOLD, 0.9),
            boxShadow: `inset 0 0 0 1px ${hexA(GOLD, 0.4)}`,
            backdropFilter: "blur(8px)",
          }}
        >
          ◉ {fbNotice}
        </div>
      )}

      {/* Transcript — the current exchange, floating above the bar. */}
      {msgs.length > 0 && (
        <div
          ref={transcriptRef}
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
        {/* Hands-free wake — say the wake word, no button needed. */}
        <button
          onClick={() => setHandsFree((v) => !v)}
          title={
            handsFree
              ? "Hands-free on — say the wake word anytime, no tap. Click to turn off."
              : "Hands-free — say the wake word to wake Jarvis without pressing the mic. Click to turn on (the browser asks for mic access once)."
          }
          aria-label="Toggle hands-free wake"
          className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-transform hover:-translate-y-px"
          style={{
            background: handsFree ? hexA(GOLD, 0.16) : "rgba(8,8,12,0.8)",
            color: handsFree ? GOLD : "var(--color-ink-2)",
            boxShadow: `inset 0 0 0 1px ${hexA(GOLD, handsFree ? 0.6 : 0.35)}`,
            animation: handsFree ? "mc-mic-pulse 3s ease-in-out infinite" : "none",
          }}
        >
          {handsFree ? "👂 hands-free on" : "👂 hands-free"}
        </button>
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
          <optgroup label="Groq Orpheus (neural)">
            {ORPHEUS_VOICES.map((name) => (
              <option key={name} value={`groq:${name.toLowerCase()}`}>
                ◉ {name}
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
