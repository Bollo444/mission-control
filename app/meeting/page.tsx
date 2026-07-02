"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MeetingMetric,
  MeetingResp,
  MeetingRosterEntry,
  MeetingTurn,
} from "@/lib/types";
import { hexA } from "@/lib/format";
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
const STORAGE_KEY = "mc.meeting.v1";

type PersistedMeeting = {
  started: boolean;
  meta: MeetingResp | null;
  turns: MeetingTurn[];
  revealed: number;
};

export default function MeetingPage() {
  const [meta, setMeta] = useState<MeetingResp | null>(null);
  const [turns, setTurns] = useState<MeetingTurn[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [partial, setPartial] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);
  const [unread, setUnread] = useState(0);
  // Agents with a REAL subagent run in flight right now (drives roster yellow).
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const streamRef = useRef<EventSource | null>(null);

  // Restore a meeting in progress so switching tabs (or reloading) never resets
  // the boardroom. We only read once, before the first paint-driven effects.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as PersistedMeeting;
        if (p.started && p.turns?.length) {
          setStarted(true);
          setMeta(p.meta);
          setTurns(p.turns);
          // Reveal everything that was already on screen — no re-animation.
          setRevealed(p.turns.length);
        }
      }
    } catch {
      /* corrupt or unavailable storage — start clean */
    }
    setHydrated(true);
  }, []);

  // Persist the live boardroom state (after hydration, so we never clobber it).
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (started) {
        const payload: PersistedMeeting = { started, meta, turns, revealed };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      /* storage full or blocked — non-fatal */
    }
  }, [hydrated, started, meta, turns, revealed]);

  // Open the live-LLM upgrade stream and patch turns in place as replies land.
  const openUpgradeStream = useCallback(() => {
    streamRef.current?.close();
    const es = new EventSource("/api/meeting/stream");
    streamRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as
          | { kind: "meta"; meta: MeetingResp }
          | { kind: "turn"; id: string; text: string }
          | { kind: "done" | "error" };
        if (ev.kind === "turn") {
          setTurns((prev) => prev.map((t) => (t.id === ev.id ? { ...t, text: ev.text } : t)));
        } else if (ev.kind === "done" || ev.kind === "error") {
          es.close();
          streamRef.current = null;
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      es.close();
      streamRef.current = null;
    };
  }, []);

  useEffect(() => () => streamRef.current?.close(), []);

  const convene = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meeting", { cache: "no-store" });
      const json = (await res.json()) as MeetingResp;
      setMeta(json); // metrics + roster are real
      // Seed the agenda STRUCTURE only (who speaks / phases) with BLANK text —
      // never show a templated sentence. Real model text streams in and fills each.
      setTurns(json.turns.map((t) => ({ ...t, text: "" })));
      setRevealed(0);
      openUpgradeStream(); // real LLM turns stream in and fill the blanks
    } finally {
      setLoading(false);
    }
  }, [openUpgradeStream]);

  // The boardroom stays quiet until you explicitly convene it — landing on the
  // tab (e.g. by accident) never auto-starts a meeting.
  const logMeeting = (event: "start" | "finish") =>
    void fetch("/api/meeting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event }),
    }).catch(() => {});

  const start = useCallback(() => {
    setStarted(true);
    void convene();
    logMeeting("start");
  }, [convene]);

  const finish = useCallback(() => {
    setStarted(false);
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    logMeeting("finish");
  }, []);

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
    const delay = Math.min(650, 200 + (next?.text.length ?? 0) * 3);
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
      const t = setTimeout(advance, 280);
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
      setTimeout(advance, 90);
    };
    u.onerror = () => advance();
    synth.cancel();
    synth.speak(u);
    return () => synth.cancel();
  }, [voiceOn, revealed, turns]);

  // Auto-scroll ONLY when you're already at the bottom (never steal your place).
  useEffect(() => {
    if (atBottomRef.current) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [revealed, busy, partial]);

  // New turn landed while you're scrolled up → bump the unread badge instead.
  useEffect(() => {
    if (!atBottomRef.current) setUnread((n) => n + 1);
  }, [revealed]);

  // REAL execution: dispatch an actual subagent CLI run for one agent and stream
  // its REAL output into the transcript, with the roster light going yellow while
  // the process is genuinely running. No simulation — this is the real agent.
  const dispatchReal = useCallback(async (r: MeetingRosterEntry, task: string) => {
    const mk = (text: string, role: string, id?: string): MeetingTurn => ({
      id: id ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      agentId: r.id, name: r.name, accent: r.accent, glyph: "◆", role, phase: "reply", text,
    });
    const res = await fetch("/api/subagents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: r.id, task }),
    }).then((x) => x.json()).catch(() => null);

    if (!res?.ok || !res.run?.id) {
      setTurns((t) => [...t, mk(`— couldn't start a live ${r.name} run: ${res?.error ?? "unknown error"} —`, "live run")]);
      setRevealed((n) => n + 1);
      return;
    }
    const runId: string = res.run.id;
    const turnId = `run-${runId}`;
    setTurns((t) => [...t, mk("", "live run…", turnId)]);
    setRevealed((n) => n + 1);
    setRunningIds((s) => new Set(s).add(r.id));

    const started = Date.now();
    const iv = setInterval(async () => {
      const stop = () => {
        clearInterval(iv);
        setRunningIds((s) => { const n = new Set(s); n.delete(r.id); return n; });
      };
      try {
        const data = await fetch("/api/subagents", { cache: "no-store" }).then((x) => x.json());
        const run = (data.runs ?? []).find((x: { id: string }) => x.id === runId);
        if (run) {
          setTurns((t) => t.map((x) => x.id === turnId
            ? { ...x, text: run.output || "", role: run.status === "running" ? "live run…" : `run ${run.status}` }
            : x));
          if (run.status !== "running") stop();
        }
      } catch { /* transient */ }
      if (Date.now() - started > 6 * 60_000) stop(); // safety cap
    }, 2000);
  }, []);

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

      // "@agent <task>" → dispatch a REAL run for that agent (not a discussion).
      const m = text.match(/^@([a-z][\w-]*)\s+([\s\S]+)/i);
      const target = m ? (meta?.roster ?? []).find((x) => x.id === m[1].toLowerCase()) : null;
      if (m && target) {
        void dispatchReal(target, m[2].trim());
        return;
      }

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
    [busy, turns.length, meta, dispatchReal]
  );

  // Click an agent (roster logo or a chat avatar/name) → drop @handle into the
  // box so you can reply to one agent directly, in public.
  const mention = useCallback((id: string) => {
    setInput((cur) => `${cur}${cur && !cur.endsWith(" ") ? " " : ""}@${id} `);
    inputRef.current?.focus();
  }, []);

  // Don't yank the reader to the bottom on every new message — only auto-scroll
  // when you're already there; otherwise count unread and offer a jump button.
  const jumpToBottom = useCallback(() => {
    atBottomRef.current = true;
    setUnread(0);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);
  const onTranscriptScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottomRef.current) setUnread(0);
  }, []);

  const shown = turns.slice(0, revealed);
  const nextSpeaker = revealed < turns.length ? turns[revealed] : null;
  // Who's "working" right now = anyone with a REAL run in flight, plus anyone
  // with a turn still queued/being revealed. Drives the roster's yellow light.
  const workingIds = new Set([
    ...runningIds,
    ...turns.slice(revealed).map((t) => t.agentId).filter((id) => id !== "user"),
  ]);

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
            The whole fleet convenes around the live system metrics — status, concerns, and where to steer next.
            Every line is generated from the real system state. Speak to the room any time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {started ? (
            <>
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
              <button
                onClick={finish}
                className="rounded-xl border px-4 py-2 text-sm font-semibold transition-colors hover:bg-[var(--color-surface-3)]"
                style={{ borderColor: "var(--color-line)", color: "var(--color-ink-3)" }}
                title="Adjourn the meeting"
              >
                ■ Finish meeting
              </button>
            </>
          ) : (
            <button
              onClick={start}
              className="rounded-xl px-5 py-2.5 text-sm font-semibold text-[#06121f]"
              style={{ background: SIGNAL }}
            >
              ▶ Convene the fleet
            </button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-hidden px-8 py-7 xl:grid-cols-[1fr_300px]">
        {/* transcript + input */}
        <div className="flex min-w-0 flex-col overflow-hidden">
          <div className="mc-panel relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div ref={scrollRef} onScroll={onTranscriptScroll} className="flex-1 overflow-auto px-5 py-4">
              {!started ? (
                <div className="grid h-full place-items-center px-6 text-center">
                  <div className="max-w-md">
                    <div className="mb-3 text-4xl">🗣️</div>
                    <h2 className="text-lg font-semibold">The boardroom is quiet</h2>
                    <p className="mt-2 text-sm text-[var(--color-ink-4)]">
                      Nothing runs until you say so. Convene the fleet to generate a
                      fresh, metric-grounded all-hands from the live system state.
                    </p>
                    <button
                      onClick={start}
                      className="mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold text-[#06121f]"
                      style={{ background: SIGNAL }}
                    >
                      ▶ Convene the fleet
                    </button>
                  </div>
                </div>
              ) : loading && shown.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-[var(--color-ink-4)]">
                  Convening the room…
                </div>
              ) : (
                <Transcript turns={shown} onMention={mention} />
              )}
              {started && nextSpeaker &&
                (voiceOn ? (
                  <SpeakingTurn turn={nextSpeaker} words={partial} />
                ) : (
                  <Typing turn={nextSpeaker} />
                ))}
              {started && busy && !nextSpeaker && <ThinkingDots />}
              <div ref={endRef} />
            </div>

            {/* Unread jump pill — appears only when you've scrolled up and new
                turns arrived; click to fly to the newest. Never auto-scrolls. */}
            {unread > 0 && (
              <button
                onClick={jumpToBottom}
                className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-1.5 text-xs font-semibold shadow-lg transition-transform hover:-translate-y-px"
                style={{ background: SIGNAL, color: "#06121f" }}
              >
                ↓ {unread} new message{unread > 1 ? "s" : ""}
              </button>
            )}

            {/* topic chips + input — only after the meeting is convened */}
            {started && (
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
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void speak(input);
                  }}
                  placeholder="Speak to the room… (click an agent to @mention)"
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
            )}
          </div>
        </div>

        {/* roster */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <div className="mc-panel p-4">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">
              Around the table · {meta?.roster.length ?? 10}
            </h2>
            <div className="flex flex-col gap-1.5">
              {(meta?.roster ?? []).map((r) => (
                <RosterTile key={r.id} r={r} working={workingIds.has(r.id)} onMention={mention} />
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

function Transcript({ turns, onMention }: { turns: MeetingTurn[]; onMention: (id: string) => void }) {
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
    out.push(<TurnRow key={t.id} t={t} onMention={onMention} />);
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
    // Subtle glow so you can always find yourself in the transcript when the
    // whole room is firing at once.
    return (
      <span
        className="grid shrink-0 place-items-center rounded-full text-sm font-bold"
        style={{
          width: size,
          height: size,
          background: hexA(accent, 0.2),
          color: accent,
          boxShadow: `inset 0 0 0 1px ${hexA(accent, 0.6)}, 0 0 14px 2px ${hexA(accent, 0.5)}`,
        }}
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

function TurnRow({ t, onMention }: { t: MeetingTurn; onMention: (id: string) => void }) {
  const isUser = t.agentId === "user";
  // Click an agent's avatar or name → @mention them in the box (public reply).
  const canMention = !isUser;
  return (
    <div className="mc-rise flex gap-3 py-2">
      {canMention ? (
        <button
          onClick={() => onMention(t.agentId)}
          title={`@${t.agentId} — reply to ${t.name}`}
          className="shrink-0 rounded-full transition-transform hover:-translate-y-px"
        >
          <Avatar agentId={t.agentId} accent={t.accent} glyph={t.glyph} />
        </button>
      ) : (
        <Avatar agentId={t.agentId} accent={t.accent} glyph={t.glyph} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {canMention ? (
            <button
              onClick={() => onMention(t.agentId)}
              title={`@${t.agentId} — reply to ${t.name}`}
              className="text-sm font-semibold hover:underline"
              style={{ color: t.accent }}
            >
              {t.name}
            </button>
          ) : (
            <span className="text-sm font-semibold" style={{ color: t.accent }}>
              {t.name}
            </span>
          )}
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">{t.role}</span>
          {t.phase === "close" && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase" style={{ background: hexA(t.accent, 0.16), color: t.accent }}>
              decision
            </span>
          )}
        </div>
        {t.text ? (
          <p
            className="mt-0.5 text-sm leading-relaxed text-[var(--color-ink-2)]"
            style={isUser ? { color: "var(--color-ink)" } : undefined}
          >
            {t.text}
          </p>
        ) : (
          <p className="mt-0.5 flex items-center gap-1.5 text-sm italic text-[var(--color-ink-4)]">
            responding live <Dots />
          </p>
        )}
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

function RosterTile({ r, working, onMention }: { r: MeetingRosterEntry; working: boolean; onMention: (id: string) => void }) {
  const { Mascot } = getSkin(r.id);
  // Light: red = offline/disconnected · yellow (pulsing) = working right now ·
  // green = idle / standing by. So you can see at a glance who's on the job.
  const offline = r.state === "offline";
  const dotColor = offline ? "#f06a7a" : working ? "#f5b75a" : "#5cd6a0";
  const dotLabel = offline ? "offline · disconnected" : working ? "working" : "idle · standby";
  const chairLabel = r.chair ? (r.role.toLowerCase().startsWith("co-chair") ? "co-chair" : "chair") : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onMention(r.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onMention(r.id);
      }}
      title={`@${r.id} — mention ${r.name} in the room`}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg border bg-[var(--color-surface-2)] px-2.5 py-2 transition-colors hover:bg-[var(--color-surface-3)]"
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
        className={`h-2 w-2 shrink-0 rounded-full${working && !offline ? " mc-live-dot" : ""}`}
        title={dotLabel}
        style={{
          background: dotColor,
          boxShadow: working && !offline ? `0 0 6px 1px ${hexA(dotColor, 0.7)}` : undefined,
        }}
      />
    </div>
  );
}
