"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AgentDetail } from "@/lib/types";
import { hexA } from "@/lib/format";

/* ------------------------------------------------------------------ *
 * Cline — the parallel prompt deck. Cline's interactive TUI needs     *
 * bun:ffi, which the npm build can't load inside the embedded ConPTY, *
 * so the panel boots a live shell with `cline` on PATH and a prompt   *
 * bar that dispatches headless runs (`cline "<prompt>"`) into it.     *
 * Prompt → run → output → back at the prompt.                         *
 * ------------------------------------------------------------------ */

const C = {
  void: "#0b0a13",
  lavender: "#9d8cff",
  lavenderBright: "#c9bfff",
  ink: "#ece9f7",
  inkDim: "#8f88a8",
  line: "#241f3a",
};

const ACCENT = C.lavender;

const ClineTerminal = dynamic(() => import("@/components/ide/NativeTerminal"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm" style={{ color: C.inkDim }}>
      spinning up the worktrees…
    </div>
  ),
});

export default function ClineConsole({ agent }: { agent: AgentDetail }) {
  const a = agent;
  const [prompt, setPrompt] = useState("");
  const [sent, setSent] = useState(0);

  const run = () => {
    const p = prompt.trim();
    if (!p) return;
    // `cline "<prompt>"` is headless zero-interaction dispatch; fire it into
    // the live shell session so output streams back in the terminal below.
    const cmd = `cline ${JSON.stringify(p)}\r`;
    void fetch("/api/hermes/pty", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session: "cline-main", type: "input", data: cmd }),
    }).catch(() => {});
    setPrompt("");
    setSent((n) => n + 1);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden" style={{ background: C.void }}>
      {/* Ambient lavender glow + grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(110% 90% at 50% 0%, ${hexA(C.lavender, 0.14)}, transparent 55%), radial-gradient(70% 60% at 90% 100%, ${hexA(C.lavender, 0.07)}, transparent 60%)`,
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-40" aria-hidden>
        <defs>
          <pattern id="cgrid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M44 0 H0 V44" fill="none" stroke={C.lavender} strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cgrid)" />
      </svg>

      {/* Header */}
      <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: C.line }}>
        <div className="leading-tight">
          <div className="font-mono text-sm font-semibold tracking-tight" style={{ color: C.ink }}>
            Cline
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.26em]" style={{ color: C.inkDim }}>
            Parallel · headless prompt deck
          </div>
        </div>
        <div className="text-right font-mono text-[11px] leading-tight" style={{ color: C.inkDim }}>
          <div style={{ color: a.status.installed ? C.lavenderBright : C.inkDim }}>
            {a.status.installed ? "● READY" : "○ OFFLINE"}
          </div>
          <div>{a.status.version || (a.status.installed ? "configured" : "not detected")}</div>
        </div>
      </header>

      {/* Prompt bar */}
      <div className="relative z-10 shrink-0 border-b px-6 py-4" style={{ borderColor: C.line }}>
        <form
          className="flex items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <span className="font-mono text-sm" style={{ color: C.lavender }}>
            ❯
          </span>
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt Cline — headless, parallel worktrees, no setup"
            className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[var(--color-ink-4)]"
            style={{ color: C.ink }}
            aria-label="Cline prompt"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg px-4 py-2 font-mono text-[12px] font-semibold transition-transform hover:-translate-y-px disabled:opacity-40"
            style={{
              background: hexA(C.lavender, 0.16),
              color: C.lavenderBright,
              boxShadow: `inset 0 0 0 1px ${hexA(C.lavender, 0.4)}`,
            }}
            disabled={!prompt.trim()}
          >
            Run →
          </button>
        </form>
        <div className="mt-2 font-mono text-[11px]" style={{ color: C.inkDim }}>
          Dispatches <span style={{ color: C.lavenderBright }}>cline &quot;&lt;prompt&gt;&quot;</span> headless into the live shell
          below — output streams back, then it returns to the prompt. You can also type directly in the terminal.
        </div>
      </div>

      {/* Terminal */}
      <main className="relative z-10 min-h-0 flex-1 p-6">
        {a.status.installed ? (
          <div
            className="flex h-full flex-col overflow-hidden rounded-2xl"
            style={{ boxShadow: `inset 0 0 0 1px ${hexA(C.lavender, 0.35)}, 0 0 80px -28px ${hexA(C.lavender, 0.5)}` }}
          >
            <div
              className="flex shrink-0 items-center justify-between px-4 py-2.5"
              style={{ borderBottom: `1px solid ${C.line}`, background: "rgba(11,10,19,0.6)" }}
            >
              <div className="flex items-center gap-2 font-mono text-[12px] font-semibold" style={{ color: C.lavenderBright }}>
                <span className="h-3 w-1 rounded-full" style={{ background: C.lavender }} />
                cline · live shell · survives navigation
              </div>
              {sent > 0 && (
                <span className="font-mono text-[11px]" style={{ color: C.inkDim }}>
                  {sent} run{sent > 1 ? "s" : ""} dispatched
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1">
              <ClineTerminal kind="cline" session="cline-main" accent={ACCENT} transparent />
            </div>
          </div>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="max-w-md text-sm leading-relaxed" style={{ color: C.inkDim }}>
              Cline&apos;s live shell appears here once it&apos;s installed
              (<span style={{ color: C.lavenderBright }}>npm install -g cline</span>).
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
