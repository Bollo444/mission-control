"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentDetail } from "@/lib/types";
import { StatusPill, ExternalLink } from "@/components/ui";
import SkillsAndTools from "./hermes/SkillsAndTools";
import MessagingStub from "./hermes/MessagingStub";
import Artifacts from "./hermes/Artifacts";
import SessionsPanel from "./hermes/SessionsPanel";
import ProfilesPanel from "./hermes/ProfilesPanel";
import ProfilesManager from "./hermes/ProfilesManager";

// The native TUI touches the DOM/EventSource — load it client-side only.
const HermesTerminal = dynamic(() => import("./NativeTerminal"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm" style={{ color: "#c9a98f" }}>
      booting the Hermes TUI…
    </div>
  ),
});

/* ------------------------------------------------------------------ *
 * Hermes' dedicated surface — classical "oxblood + gold" identity,    *
 * distinct from the cyan fleet dash. Left: the real native Hermes TUI. *
 * Right: orchestration. The caduceus is the signature element.        *
 * ------------------------------------------------------------------ */

const OX = {
  base: "#08080a",
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  goldBright: "#ffd483",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};

function Caduceus({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      {/* wings */}
      <path
        d="M32 14c-6-6-16-7-22-4 5 1 9 4 11 8-6-2-12-1-16 2 6 0 11 2 15 6M32 14c6-6 16-7 22-4-5 1-9 4-11 8 6-2 12-1 16 2-6 0-11 2-15 6"
        stroke={OX.gold}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* staff */}
      <line x1="32" y1="12" x2="32" y2="56" stroke={OX.goldBright} strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="11" r="2.4" fill={OX.goldBright} />
      {/* twin serpents */}
      <path
        d="M32 20c8 2 8 8 0 10s-8 8 0 10 8 8 0 10"
        stroke={OX.gold}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M32 20c-8 2-8 8 0 10s8 8 0 10-8 8 0 10"
        stroke={OX.gold}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ChatMsg {
  who: "you" | "hermes";
  text: string;
  // For reply bubbles: the paired agent this turn was delegated to (null → Hermes himself).
  agent?: string | null;
}

// Low-alpha rgba from a #rrggbb hex — for tinted bubble fills/borders.
function hexA(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ---- Tab bar types -------------------------------------------------------

type TabId = "new-session" | "skills-tools" | "profiles" | "messaging" | "artifacts";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "new-session", label: "New Session" },
  { id: "skills-tools", label: "Skills & Tools" },
  { id: "profiles", label: "Profiles" },
  { id: "messaging", label: "Messaging" },
  { id: "artifacts", label: "Artifacts" },
];

// ---- Main component -----------------------------------------------------

export default function HermesConsole({ agent }: { agent: AgentDetail }) {
  const a = agent;
  const [orchestrating, setOrchestrating] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("new-session");

  // ---- Update check (#5) -------------------------------------------------
  const [update, setUpdate] = useState<{
    current: string | null;
    latest: string | null;
    updateAvailable: boolean;
  } | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetch("/api/hermes/update")
      .then((r) => r.json())
      .then(setUpdate)
      .catch(() => {});
  }, []);

  const runUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const res = await fetch("/api/hermes/update", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        const re = await fetch("/api/hermes/update").then((r) => r.json());
        setUpdate(re);
      }
    } finally {
      setUpdating(false);
    }
  }, []);

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={{
        background: `radial-gradient(1100px 480px at 78% -8%, rgba(245,183,90,0.10), transparent 60%), ${OX.base}`,
        color: OX.ink,
      }}
    >
      {/* Gilded hairline frame — the premium tell, kept quiet. */}
      <div
        className="pointer-events-none absolute inset-2 rounded-2xl"
        style={{ boxShadow: `inset 0 0 0 1px ${OX.line}` }}
      />

      {/* Hero */}
      <header
        className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-5 overflow-hidden px-8 py-6"
        style={{ borderBottom: `1px solid ${OX.line}` }}
      >
        {/* Hero-top gold shimmer — a sweeping band across the whole header, distinct
            from the logo's radial glow. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background:
              "linear-gradient(105deg, transparent 30%, rgba(245,183,90,0.16) 47%, rgba(255,212,131,0.28) 50%, rgba(245,183,90,0.16) 53%, transparent 70%)",
            backgroundSize: "220% 100%",
            animation: "mc-sheen 4s linear infinite",
            maskImage: "linear-gradient(to bottom, black, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, black, transparent)",
          }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, #ffd483, #f5b75a, #ffd483, transparent)",
            backgroundSize: "220% 100%",
            animation: "mc-sheen 4s linear infinite",
          }}
        />
        <div className="relative z-10 flex items-center gap-5">
          <div className="relative grid shrink-0 place-items-center">
            {/* Gold shimmer radiating outward from the logo — the signature, popping on black. */}
            <span
              aria-hidden
              className="pointer-events-none absolute h-32 w-32 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(245,183,90,0.5), rgba(245,183,90,0.12) 45%, transparent 72%)",
                filter: "blur(6px)",
                animation: "mc-breathe 3.6s ease-in-out infinite",
              }}
            />
            <span
              className="mc-anim-float relative grid h-20 w-20 place-items-center rounded-2xl"
              style={{ background: "rgba(245,183,90,0.08)", boxShadow: "inset 0 0 0 1px rgba(245,183,90,0.35)" }}
            >
              <Caduceus size={56} />
            </span>
          </div>
          <div className="min-w-0">
            <div
              className="mb-1 text-[11px] font-semibold uppercase tracking-[0.28em]"
              style={{ color: OX.gold }}
            >
              Olympus · messenger of the fleet
            </div>
            <h1
              className="font-serif text-4xl font-semibold tracking-tight"
              style={{ color: OX.ink, letterSpacing: "0.01em" }}
            >
              {a.name}
            </h1>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: OX.inkDim }}>
              {a.tagline}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill on={a.status.installed} labelOn="ready" accent={OX.gold} />
          <div className="text-xs" style={{ color: OX.inkDim }}>
            {update?.current ? `v${update.current}` : a.status.version || "installed"}
          </div>
          {update?.updateAvailable ? (
            <button
              onClick={runUpdate}
              disabled={updating}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-transform hover:-translate-y-px disabled:opacity-50"
              style={{ background: OX.gold, color: OX.base }}
              title={`Update Hermes ${update.current} → ${update.latest}`}
            >
              {updating ? "Updating…" : `↑ Update → ${update.latest}`}
            </button>
          ) : (
            update && (
              <span className="text-[11px]" style={{ color: OX.inkDim }}>
                {update.latest ? "up to date" : "version current"}
              </span>
            )
          )}
          {a.homepage && <ExternalLink href={a.homepage}>{a.homepage.replace(/^https?:\/\//, "")}</ExternalLink>}
        </div>
      </header>

      {/* Tab bar — gold/oxblood identity, directly under the hero. */}
      <nav
        className="relative z-10 flex shrink-0 items-end gap-1 px-6"
        style={{ borderBottom: `1px solid ${OX.line}`, background: OX.surface }}
        aria-label="Hermes panel tabs"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative px-4 py-2.5 text-sm font-medium transition-colors"
              style={
                active
                  ? { color: OX.gold }
                  : { color: OX.inkDim }
              }
            >
              {tab.label}
              {/* Active underline — the gold bar that marks the current tab. */}
              {active && (
                <span
                  className="absolute inset-x-0 bottom-0 h-0.5 rounded-t"
                  style={{ background: OX.gold }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Body — tab content area */}
      <div className="relative z-10 min-h-0 flex-1 overflow-hidden">

        {/* ---- NEW SESSION TAB ----
            IMPORTANT: HermesTerminal is never unmounted — it is hidden via CSS when
            another tab is active, preserving the live PTY session. */}
        <div
          className="h-full"
          style={{ display: activeTab === "new-session" ? undefined : "none" }}
        >
          <div className="grid h-full min-h-0 grid-cols-1 gap-5 px-6 py-5 lg:grid-cols-[1fr_320px]">
            {/* Native TUI */}
            <section
              className="flex min-h-0 flex-col overflow-hidden rounded-xl"
              style={{ border: `1px solid ${OX.line}`, background: OX.base }}
            >
              <div
                className="flex shrink-0 items-center justify-between px-4 py-2.5"
                style={{ borderBottom: `1px solid ${OX.line}`, background: OX.surface }}
              >
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: OX.gold }}>
                  <span className="h-3 w-1 rounded-full" style={{ background: OX.gold }} />
                  Native Hermes TUI · solo
                </div>
                <span className="font-mono text-[11px]" style={{ color: OX.inkDim }}>
                  live PTY · resumes across tabs
                </span>
              </div>
              <div className="min-h-0 flex-1">
                <HermesTerminal session="hermes-main" kind="hermes" />
              </div>
            </section>

            {/* Orchestration rail — extended with SessionsPanel + ProfilesPanel */}
            <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto">
              <div className="rounded-xl p-4" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: OX.inkDim }}>
                  Duo flow
                </div>
                <p className="mb-3 text-xs leading-relaxed" style={{ color: OX.inkDim }}>
                  Pair Hermes with one agent on a task — <span style={{ color: OX.gold }}>@openclaw</span>,{" "}
                  <span style={{ color: OX.gold }}>@claude</span> — and the two work it together. For the whole
                  room, use the Team Meeting tab.
                </p>
                <button
                  onClick={() => setOrchestrating(true)}
                  className="w-full rounded-lg px-3 py-2 text-sm font-semibold transition-transform hover:-translate-y-px"
                  style={{ background: OX.gold, color: OX.base }}
                >
                  ⬡ Duo flow
                </button>
              </div>

              <div className="rounded-xl p-4" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: OX.inkDim }}>
                  Capabilities
                </div>
                <div className="flex flex-col gap-1.5">
                  {a.tools.map((t) => (
                    <div key={t} className="flex items-center gap-2 text-sm" style={{ color: OX.ink }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: OX.gold }} />
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              {/* Sessions — scrollable list of past/current sessions */}
              <SessionsPanel />

              {/* Profiles — active profile count + each profile identity */}
              <ProfilesPanel />
            </aside>
          </div>
        </div>

        {/* ---- SKILLS & TOOLS TAB ---- */}
        {activeTab === "skills-tools" && (
          <div className="h-full overflow-hidden px-6 py-5">
            <SkillsAndTools />
          </div>
        )}

        {/* ---- PROFILES TAB ---- */}
        {activeTab === "profiles" && (
          <div className="h-full overflow-hidden px-6 py-5">
            <ProfilesManager />
          </div>
        )}

        {/* ---- MESSAGING TAB ---- */}
        {activeTab === "messaging" && (
          <div className="h-full overflow-hidden px-6 py-5">
            <MessagingStub />
          </div>
        )}

        {/* ---- ARTIFACTS TAB ---- */}
        {activeTab === "artifacts" && (
          <div className="h-full overflow-hidden px-6 py-5">
            <Artifacts />
          </div>
        )}
      </div>

      {orchestrating && <OrchestrationRelay onClose={() => setOrchestrating(false)} />}
    </div>
  );
}

// ponytail: static fleet for the @-picker; mirrors lib/registry ids + accents (rarely changes).
// Hermes excluded — he's the orchestrator, not a delegate.
const FLEET: [string, string, string][] = [
  ["claude", "Claude Code", "#e0915f"],
  ["openclaw", "OpenClaw", "#ff4438"],
  ["pi", "Pi", "#5cd6a0"],
  ["opencode", "OpenCode", "#9d8cff"],
  ["antigravity", "Antigravity", "#6ea8fe"],
  ["jcode", "jcode", "#46e0d0"],
  ["vibe", "Vibe", "#f06a7a"],
  ["kilo", "Kilo Code", "#c0c6d4"],
  ["sentinel", "Sentinel", "#d65db1"],
];

const FLEET_ACCENT: Record<string, string> = Object.fromEntries(
  FLEET.map(([id, , accent]) => [id, accent]),
);

// Resolve a paired-agent id to its accent; unknown / null → Hermes gold.
const agentAccent = (id?: string | null): string =>
  (id && FLEET_ACCENT[id]) || OX.gold;

// localStorage key — mirrors the Team Meeting persistence pattern (mc.meeting.v1).
const DUO_KEY = "mc.duo.v1";

/** The Duo-flow chat popup — @mention an agent and Hermes pairs with them over ACP. */
function OrchestrationRelay({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  // localStorage is the source of truth — wait for rehydrate before persisting,
  // so the empty initial state never clobbers a saved convo.
  const [hydrated, setHydrated] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Rehydrate the convo on mount — the popup remounts each open, so this runs
  // every time and pulls the persisted history back in.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DUO_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { msgs?: ChatMsg[]; input?: string };
        if (Array.isArray(saved.msgs)) setMsgs(saved.msgs);
        if (typeof saved.input === "string") setInput(saved.input);
      }
    } catch {
      /* ignore corrupt/absent state */
    }
    setHydrated(true);
  }, []);

  // Persist on every change — nothing resets across close/reopen or navigation.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DUO_KEY, JSON.stringify({ msgs, input }));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [msgs, input, hydrated]);

  // Suggest agents while typing a trailing @mention.
  const mention = input.match(/@(\w*)$/);
  const suggestions = mention
    ? FLEET.filter(([id]) => id.startsWith(mention[1].toLowerCase())).slice(0, 6)
    : [];
  const pickMention = (id: string) => setInput((v) => v.replace(/@\w*$/, `@${id} `));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    // Pull the first @mention out of the sent text → the agent this turn pairs with.
    const m = text.match(/@(\w+)/);
    const paired = m && FLEET_ACCENT[m[1].toLowerCase()] ? m[1].toLowerCase() : null;
    setInput("");
    setMsgs((m) => [...m, { who: "you", text }, { who: "hermes", text: "", agent: paired }]);
    setBusy(true);
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
          const frame = buf.slice(0, nl);
          buf = buf.slice(nl + 2);
          const line = frame.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const ev = JSON.parse(line) as { type: string; text?: string; message?: string };
            if (ev.type === "chunk" && ev.text) {
              setMsgs((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = { ...last, who: "hermes", text: last.text + ev.text };
                return copy;
              });
            } else if (ev.type === "error") {
              setMsgs((m) => {
                const copy = [...m];
                const last = copy[copy.length - 1];
                copy[copy.length - 1] = { ...last, who: "hermes", text: `⚠ ${ev.message}` };
                return copy;
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (e) {
      setMsgs((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, who: "hermes", text: `⚠ ${(e as Error).message}` };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }, [input, busy]);

  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-6" style={{ background: "rgba(8,4,5,0.6)" }}>
      <div
        className="flex h-[80%] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
        style={{ background: OX.surface, boxShadow: `0 0 0 1px ${OX.line}, 0 30px 80px -20px rgba(0,0,0,0.8)` }}
      >
        <div
          className="flex shrink-0 items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${OX.line}` }}
        >
          <div className="flex items-center gap-2">
            <Caduceus size={22} />
            <span className="font-serif text-lg font-semibold" style={{ color: OX.ink }}>
              Duo flow
            </span>
            <span className="text-[11px]" style={{ color: OX.inkDim }}>
              @mention an agent · Hermes pairs with them
            </span>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-lg"
            style={{ color: OX.inkDim }}
            aria-label="Close relay"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {msgs.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm" style={{ color: OX.inkDim }}>
              <div className="max-w-sm">
                Pair Hermes with one agent: <span style={{ color: OX.gold }}>@openclaw clean up the temp folder</span>,{" "}
                <span style={{ color: OX.gold }}>@claude refactor lib/meeting.ts</span>. Hermes drives the duo; replies
                stream from the real agent.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {msgs.map((m, i) => {
                // Reply bubbles are tinted with the paired agent's accent (or Hermes gold).
                const accent = agentAccent(m.agent);
                const handle = m.agent ?? "hermes";
                return (
                  <div key={i} className={m.who === "you" ? "self-end" : "self-start"}>
                    {m.who !== "you" && (
                      <div
                        className="mb-0.5 pl-0.5 text-[11px] font-semibold tracking-wide"
                        style={{ color: accent }}
                      >
                        @{handle}
                      </div>
                    )}
                    <div
                      className="max-w-[80%] rounded-xl px-3.5 py-2 text-sm leading-relaxed"
                      style={
                        m.who === "you"
                          ? { background: OX.gold, color: OX.base }
                          : {
                              background: hexA(accent, 0.12),
                              color: OX.ink,
                              border: `1px solid ${hexA(accent, 0.55)}`,
                            }
                      }
                    >
                      {m.text || (busy ? "…" : "")}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}
        </div>

        <div className="relative flex shrink-0 items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${OX.line}` }}>
          {suggestions.length > 0 && (
            <div
              className="absolute bottom-full left-4 mb-1 w-56 overflow-hidden rounded-lg"
              style={{ background: OX.surface2, border: `1px solid ${OX.line}` }}
            >
              {suggestions.map(([id, name, accent]) => (
                <button
                  key={id}
                  onClick={() => pickMention(id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-black/30"
                  style={{ color: OX.ink }}
                >
                  <span style={{ color: accent }}>@{id}</span>
                  <span className="text-[11px]" style={{ color: OX.inkDim }}>{name}</span>
                </button>
              ))}
            </div>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions.length === 0) void send();
            }}
            placeholder="@agent, then the task…"
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: OX.base, color: OX.ink, border: `1px solid ${OX.line}` }}
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
            style={{ background: OX.gold, color: OX.base }}
          >
            {busy ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
