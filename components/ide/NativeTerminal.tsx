"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * The real, native CLI harness of an agent, embedded in the page.      *
 * xterm.js renders a true terminal; keystrokes POST to the PTY bridge   *
 * and output streams back over SSE. The PTY lives server-side, so       *
 * leaving and returning to the tab resumes the SAME session (scrollback *
 * is replayed on connect). Each agent spawns its OWN CLI (kind = agent  *
 * id), so its recognizable banner/branding renders on load.             *
 *                                                                       *
 * To make the *client* view survive navigation with zero reset, the     *
 * live xterm instance and its SSE stream live in a MODULE-LEVEL         *
 * registry, outliving the React component. The component just adopts    *
 * (appends) the persistent host element on mount and detaches it on     *
 * unmount — the term is never disposed and the stream never closed, so  *
 * scrollback / cursor / half-typed input survive across navigations.    *
 * ------------------------------------------------------------------ */

const OXBLOOD = "#08080a";
const GOLD = "#f5b75a";
const PARCHMENT = "#f3e6d8";

type Status = "connecting" | "live" | "ended";

interface Entry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  term: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fit: any;
  es: EventSource;
  host: HTMLDivElement;
  status: Status;
  /** The currently-mounted component's status setter, if any. */
  setStatus: ((s: Status) => void) | null;
}

// One live terminal per `${kind}:${session}`. Survives component unmount.
const TERMS = new Map<string, Entry>();

export default function NativeTerminal({
  session = "hermes-main",
  kind = "hermes",
  accent = GOLD,
}: {
  session?: string;
  kind?: string;
  /** Per-agent identity color — themes cursor + highlight for brand recognition. */
  accent?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const key = `${kind}:${session}`;
    let disposed = false;
    let resizeObs: ResizeObserver | null = null;
    const fitTimers: ReturnType<typeof setTimeout>[] = [];

    // Adopt an entry's persistent host into this component's container,
    // (re)fit, observe size, focus, and reflect its status into state.
    const adopt = (entry: Entry) => {
      if (disposed || !hostRef.current) return;
      entry.setStatus = setStatus;
      setStatus(entry.status);
      hostRef.current.appendChild(entry.host);

      const syncSize = () => {
        // Only fit once the host actually has a box — fitting at 0px sizes the
        // terminal to ~1 row (the "just a cursor" symptom) and Hermes' TUI then
        // draws clipped. Skip until layout gives the host real dimensions.
        const host = hostRef.current;
        if (!host || host.clientHeight < 8 || host.clientWidth < 8) return;
        try {
          entry.fit.fit();
          void post({ type: "resize", cols: entry.term.cols, rows: entry.term.rows });
        } catch {
          /* ignore */
        }
      };
      try {
        entry.fit.fit();
      } catch {
        /* ignore pre-layout fit */
      }
      // Re-fit after layout settles. A single fit on mount can run mid route-
      // transition (animating height) and mis-measure; these catch the final size
      // and re-tell the PTY, so Hermes redraws its TUI to the correct dimensions.
      requestAnimationFrame(syncSize);
      fitTimers.push(setTimeout(syncSize, 120), setTimeout(syncSize, 400));
      resizeObs = new ResizeObserver(syncSize);
      resizeObs.observe(hostRef.current);
      entry.term.focus();
    };

    const post = (payload: Record<string, unknown>) =>
      fetch("/api/hermes/pty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, ...payload }),
      }).catch(() => {});

    const existing = TERMS.get(key);
    if (existing) {
      // Reuse the live term/stream — no reset, no flash.
      adopt(existing);
    } else {
      (async () => {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        // xterm's stylesheet is loaded globally via app/globals.css.
        if (disposed) return;
        // Another mount may have created the entry while we awaited.
        const racey = TERMS.get(key);
        if (racey) {
          adopt(racey);
          return;
        }

        // Detached host the xterm is open()ed into ONCE; it travels between
        // component mounts so the rendered view is never rebuilt.
        const host = document.createElement("div");
        host.className = "h-full w-full px-3 py-2";

        const term = new Terminal({
          cursorBlink: true,
          fontFamily:
            '"Cascadia Code", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.2,
          theme: {
            background: OXBLOOD,
            foreground: PARCHMENT,
            cursor: accent,
            cursorAccent: OXBLOOD,
            selectionBackground: "#2c2c30",
            black: "#1b1b1e",
            red: "#ff6b6b",
            green: "#7bd88f",
            yellow: accent,
            blue: "#7aa2f7",
            magenta: "#d6a4ff",
            cyan: "#7be0d0",
            white: PARCHMENT,
            brightYellow: accent,
          },
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(host);
        try {
          fit.fit();
        } catch {
          /* ignore pre-layout fit */
        }

        // Keystrokes → PTY.
        term.onData((d: string) => void post({ type: "input", data: d }));

        const cols = term.cols || 80;
        const rows = term.rows || 24;
        const es = new EventSource(
          `/api/hermes/pty?session=${encodeURIComponent(session)}&kind=${encodeURIComponent(
            kind
          )}&cols=${cols}&rows=${rows}`
        );

        const entry: Entry = { term, fit, es, host, status: "connecting", setStatus: null };
        TERMS.set(key, entry);

        const setBoth = (s: Status) => {
          entry.status = s;
          entry.setStatus?.(s);
        };

        es.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data) as { type: string; data?: string; message?: string };
            if (msg.type === "data" && msg.data) term.write(msg.data);
            else if (msg.type === "ready") {
              setBoth("live");
              try {
                fit.fit();
                void post({ type: "resize", cols: term.cols, rows: term.rows });
              } catch {
                /* ignore */
              }
            } else if (msg.type === "error") {
              term.write(`\r\n\x1b[31m${msg.message ?? "error"}\x1b[0m\r\n`);
            } else if (msg.type === "exit") {
              setBoth("ended");
            }
          } catch {
            /* ignore malformed frame */
          }
        };
        es.onerror = () => {
          // EventSource auto-reconnects; surface as connecting until data resumes.
          setBoth("connecting");
        };

        // Mount the freshly-created host into this component.
        adopt(entry);
      })();
    }

    return () => {
      disposed = true;
      resizeObs?.disconnect();
      fitTimers.forEach(clearTimeout);
      // DETACH only — keep the term and SSE stream alive off-screen so the
      // session (scrollback/cursor/typed input) survives navigation.
      const entry = TERMS.get(key);
      if (entry) {
        if (entry.setStatus === setStatus) entry.setStatus = null;
        if (entry.host.parentNode) entry.host.parentNode.removeChild(entry.host);
      }
    };
  }, [session, kind, accent]);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: OXBLOOD }}>
      {/* Container — the persistent xterm host div is appended here. */}
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {status !== "live" && (
        <div
          className="pointer-events-none absolute right-3 top-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{
            color: status === "ended" ? "#ff8f8f" : accent,
            background: "rgba(0,0,0,0.35)",
          }}
        >
          {status === "ended" ? "session ended" : "connecting…"}
        </div>
      )}
    </div>
  );
}
