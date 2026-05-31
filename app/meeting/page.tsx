"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MeetingMetric,
  MeetingResp,
  MeetingRosterEntry,
  MeetingTurn,
} from "@/lib/types";
import { hexA, stateColor } from "@/lib/format";
import { getSkin } from "@/components/skins";
import { getVoicePref, pickVoice } from "@/lib/voices";

const PHASE_LABEL: Record<string, string> = {
  open: "Roll call",
  status: "Status round",
  concern: "Concerns",
  suggestion: "Where to go next",
  question: "Open questions",
  close: "Closing decision",
  reply: "Discussion",
};

const TOPICS: { label: string; message: string }[] = [
  { label: "Metrics", message: "How do our current metrics look?" },
  { label: "Improvements", message: "Where should we improve first?" },
  { label: "Next steps", message: "What should we tackle next?" },
  { label: "Risks", message: "What are the biggest risks right now?" },
  { label: "Memory", message: "Is our shared memory and context healthy?" },
];

const toneColor: Record<MeetingMetric["tone"], string> = {
  ok: "#5cd6a0",
  warn: "#f5b75a",
  crit: "#f06a7a",
  neutral: "#aab1c2",
};

const SIGNAL = "#46e0d0";

export default function MeetingPage() {
  const [meta, setMeta] = useState<MeetingResp | null>(null);
  const [turns, setTurns] = useState<MeetingTurn[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [voiceOn, setVoiceOn] = useState(false);
  const [partial, setPartial] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  const convene = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meeting", { cache: "no-store" });
      const json = (await res.json()) as MeetingResp;
      setMeta(json);
      setTurns(json.turns);
      setRevealed(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void convene();
  }, [convene]);

  // Load installed TTS voices (async on most browsers) and stop speech on exit.
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const load = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Silent mode: reveal whole turns on a timer (voice mode drives reveal itself).
  useEffect(() => {
    if (voiceOn || revealed >= turns.length) return;
    const next = turns[revealed];
    const delay = Math.min(1500, 480 + (next?.text.length ?? 0) * 7);
    const t = setTimeout(() => setRevealed((r) => r + 1), delay);
    return () => clearTimeout(t);
  }, [revealed, turns, voiceOn]);

  // Voice mode: speak the next turn in its agent's voice, revealing words as spoken.
  useEffect(() => {
    if (!voiceOn || revealed >= turns.length) return;
    const turn = turns[revealed];
    const advance = () => setRevealed((r) => r + 1);
    if (turn.agentId === "user" || typeof window === "undefined" || !window.speechSynthesis) {
      setPartial(Infinity);
      const t = setTimeout(advance, 500);
      return () => clearTimeout(t);
    }
    const synth = window.speechSynthesis;
    const pref = getVoicePref(turn.agentId);
    const u = new SpeechSynthesisUtterance(turn.text);
    const v = pickVoice(voicesRef.current, pref);
    if (v) u.voice = v;
    u.lang = pref.lang;
    u.rate = pref.rate;
    u.pitch = pref.pitch;
    setPartial(0);
    u.onboundary = (e) => {
      const upto = turn.text.slice(0, e.charIndex ?? 0).trim();
      setPartial(upto ? upto.split(/\s+/).length + 1 : 1);
    };
    u.onend = () => {
      setPartial(Infinity);
      setTimeout(advance, 140);
    };
    u.onerror = () => advance();
    synth.cancel();
    synth.speak(u);
    return () => synth.cancel();
  }, [voiceOn, revealed, turns]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [revealed, busy, partial]);

  const speak = useCallback(
    async (message: string) => {
      const text = message.trim();
      if (!text || busy) return;
      setInput("");
      const len = turns.length;
      const userTurn: MeetingTurn = {
        id: `u${Date.now()}`,
        agentId: "user",
        name: "You",
        accent: SIGNAL,
        glyph: "❯",
        role: "Mission lead",
        phase: "reply",
        text,
      };
      setTurns((t) => [...t, userTurn]);
      setRevealed(len + 1); // show the user's message immediately
      setBusy(true);
      try {
        const res = await fetch("/api/meeting", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const json = (await res.json()) as { turns: MeetingTurn[] };
        setTurns((t) => [...t, ...(json.turns ?? [])]);
      } finally {
        setBusy(false);
      }
    },
    [busy, turns.length]
  );

  const shown = turns.slice(0, revealed);
  const nextSpeaker = revealed < turns.length ? turns[revealed] : null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* header + live metrics */}
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 border-b px-8 py-6">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: SIGNAL }}>
            All-hands · live boardroom
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Team Meeting</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-3)]">
            All nine agents convene around the live fleet metrics — status, concerns, and where to steer next.
            Every line is generated from the real system state. Speak to the room any time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {(meta?.metrics ?? []).map((m) => (
            <div key={m.label} className="rounded-xl border bg-[var(--color-surface)] px-3.5 py-2 text-center">
              <div className="mc-stat-value text-lg leading-none" style={{ color: toneColor[m.tone] }}>
                {m.value}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">{m.label}</div>
            </div>
          ))}
          <button
            onClick={() => setVoiceOn((v) => !v)}
            className="rounded-xl border px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-3)]"
            style={voiceOn ? { borderColor: hexA(SIGNAL, 0.5), color: SIGNAL } : { color: "var(--color-ink-3)" }}
            title="Read the meeting aloud — each agent in its own voice & accent"
          >
            {voiceOn ? "🔊 Voices on" : "🔈 Voices off"}
          </button>
          <button
            onClick={convene}
            disabled={loading}
            className="rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-3)] disabled:opacity-40"
            style={{ borderColor: hexA(SIGNAL, 0.4), color: SIGNAL }}
          >
            {loading ? "Convening…" : "↻ New round"}
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden px-8 py-7 xl:grid-cols-[1fr_300px]">
        {/* transcript + input */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="mc-panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-auto px-5 py-4">
              {loading && shown.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[var(--color-ink-4)]">
                  Convening the room…
                </div>
              ) : (
                <Transcript turns={shown} />
              )}
              {nextSpeaker &&
                (voiceOn ? (
                  <SpeakingTurn turn={nextSpeaker} words={partial} />
                ) : (
                  <Typing turn={nextSpeaker} />
                ))}
              {busy && !nextSpeaker && <ThinkingDots />}
              <div ref={endRef} />
            </div>

            {/* topic chips + input */}
            <div className="shrink-0 border-t px-4 py-3">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {TOPICS.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => void speak(t.message)}
                    disabled={busy}
                    className="rounded-full border px-3 py-1 text-xs text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] disabled:opacity-40"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void speak(input);
                  }}
                  placeholder="Speak to the room…"
                  className="min-w-0 flex-1 rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-ink-4)]"
                />
                <button
                  onClick={() => void speak(input)}
                  disabled={busy || !input.trim()}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-[#06121f] disabled:opacity-40"
                  style={{ background: SIGNAL }}
                >
                  {busy ? "…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* roster */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <div className="mc-panel p-4">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">
              Around the table · {meta?.roster.length ?? 9}
            </h2>
            <div className="flex flex-col gap-1.5">
              {(meta?.roster ?? []).map((r) => (
                <RosterTile key={r.id} r={r} />
              ))}
            </div>
          </div>
          <div className="mc-panel-2 p-4 text-xs leading-relaxed text-[var(--color-ink-3)]">
            <div className="mb-1 flex items-center gap-2 font-semibold text-[var(--color-ink-2)]">
              <span style={{ color: SIGNAL }}>❂</span> How this works
            </div>
            Each agent speaks through what it genuinely excels at, grounded in the live system check. Ask a
            question and the room routes it to whoever is most relevant — the chair (Claude) synthesizes.
          </div>
        </aside>
      </div>
    </div>
  );
}

function Transcript({ turns }: { turns: MeetingTurn[] }) {
  const out: React.ReactNode[] = [];
  let lastPhase = "";
  let seenReply = false;
  turns.forEach((t) => {
    const showDivider =
      t.phase !== "reply" ? t.phase !== lastPhase : !seenReply;
    if (showDivider) {
      out.push(<PhaseDivider key={`d-${t.id}`} label={PHASE_LABEL[t.phase] ?? t.phase} />);
      if (t.phase === "reply") seenReply = true;
    }
    lastPhase = t.phase;
    out.push(<TurnRow key={t.id} t={t} />);
  });
  return <div className="flex flex-col">{out}</div>;
}

function PhaseDivider({ label }: { label: string }) {
  return (
    <div className="mc-rise my-3 flex items-center gap-3 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-4)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--color-line)]" />
    </div>
  );
}

function Avatar({ agentId, accent, glyph, size = 34 }: { agentId: string; accent: string; glyph: string; size?: number }) {
  if (agentId === "user") {
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full text-sm font-bold"
        style={{ width: size, height: size, background: hexA(accent, 0.16), color: accent, boxShadow: `inset 0 0 0 1px ${hexA(accent, 0.4)}` }}
      >
        {glyph}
      </span>
    );
  }
  const { Mascot } = getSkin(agentId);
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size, background: hexA(accent, 0.1), boxShadow: `inset 0 0 0 1px ${hexA(accent, 0.3)}` }}
    >
      <Mascot size={size - 8} />
    </span>
  );
}

function TurnRow({ t }: { t: MeetingTurn }) {
  const isUser = t.agentId === "user";
  return (
    <div className="mc-rise flex gap-3 py-2">
      <Avatar agentId={t.agentId} accent={t.accent} glyph={t.glyph} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: t.accent }}>
            {t.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">{t.role}</span>
          {t.phase === "close" && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: hexA(t.accent, 0.16), color: t.accent }}>
              decision
            </span>
          )}
        </div>
        <p
          className="mt-0.5 text-sm leading-relaxed text-[var(--color-ink-2)]"
          style={isUser ? { color: "var(--color-ink)" } : undefined}
        >
          {t.text}
        </p>
      </div>
    </div>
  );
}

function SpeakingTurn({ turn, words }: { turn: MeetingTurn; words: number }) {
  const all = turn.text.split(/\s+/);
  const shown = words >= all.length ? turn.text : all.slice(0, Math.max(0, words)).join(" ");
  return (
    <div className="flex gap-3 py-2">
      <Avatar agentId={turn.agentId} accent={turn.accent} glyph={turn.glyph} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: turn.accent }}>
            {turn.name}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">{turn.role}</span>
          <span className="text-[10px]" style={{ color: turn.accent }}>🔊 speaking</span>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-[var(--color-ink-2)]">
          {shown}
          <span
            className="ml-0.5 inline-block h-3.5 w-1.5 align-[-2px]"
            style={{ background: turn.accent, animation: "mc-type 1s steps(1) infinite" }}
          />
        </p>
      </div>
    </div>
  );
}

function Typing({ turn }: { turn: MeetingTurn }) {
  return (
    <div className="flex items-center gap-3 py-2 opacity-80">
      <Avatar agentId={turn.agentId} accent={turn.accent} glyph={turn.glyph} size={28} />
      <div className="flex items-center gap-1.5">
        <span className="text-xs" style={{ color: turn.accent }}>
          {turn.name} is typing
        </span>
        <Dots />
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 py-2 text-xs text-[var(--color-ink-4)]">
      the room is thinking <Dots />
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1 w-1 rounded-full bg-current"
          style={{ animation: `mc-type 1s ${i * 0.18}s infinite` }}
        />
      ))}
    </span>
  );
}

function RosterTile({ r }: { r: MeetingRosterEntry }) {
  const { Mascot } = getSkin(r.id);
  const chairLabel = r.chair ? (r.role.toLowerCase().startsWith("co-chair") ? "co-chair" : "chair") : null;
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg border bg-[var(--color-surface-2)] px-2.5 py-2"
      style={{ borderColor: r.chair ? hexA(r.accent, 0.4) : "var(--color-line-soft)" }}
    >
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
        style={{ background: hexA(r.accent, 0.1) }}
      >
        <Mascot size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium" style={{ color: r.accent }}>
            {r.name}
          </span>
          {chairLabel && (
            <span
              className="shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wider"
              style={{ background: hexA(r.accent, 0.18), color: r.accent }}
              title={chairLabel === "chair" ? "Chair — synthesis & decision" : "Co-chair — delegation & parallel execution"}
            >
              {chairLabel === "chair" ? "♚ chair" : "♜ co-chair"}
            </span>
          )}
        </div>
        <div className="truncate text-[10px] text-[var(--color-ink-4)]">{r.role}</div>
      </div>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        title={r.state}
        style={{ background: stateColor(r.state) }}
      />
    </div>
  );
}
