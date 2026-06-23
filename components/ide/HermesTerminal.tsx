"use client";

import { useEffect, useRef, useState } from "react";

/* ------------------------------------------------------------------ *
 * The real, native Hermes TUI embedded in the page. xterm.js renders   *
 * a true terminal; keystrokes POST to the PTY bridge and output streams *
 * back over SSE. The PTY lives server-side, so leaving and returning to *
 * the tab resumes the SAME session (scrollback is replayed on connect). *
 * ------------------------------------------------------------------ */

const OXBLOOD = "#08080a";
const GOLD = "#f5b75a";
const PARCHMENT = "#f3e6d8";

export default function HermesTerminal({
  session = "hermes-main",
  kind = "hermes",
}: {
  session?: string;
  kind?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "ended">("connecting");

  useEffect(() => {
    let disposed = false;
    let es: EventSource | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let term: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fit: any = null;
    let resizeObs: ResizeObserver | null = null;

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      // xterm's stylesheet is loaded globally via app/globals.css.
      if (disposed || !hostRef.current) return;

      term = new Terminal({
        cursorBlink: true,
        fontFamily:
          '"Cascadia Code", "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.2,
        theme: {
          background: OXBLOOD,
          foreground: PARCHMENT,
          cursor: GOLD,
          cursorAccent: OXBLOOD,
          selectionBackground: "#2c2c30",
          black: "#1b1b1e",
          red: "#ff6b6b",
          green: "#7bd88f",
          yellow: GOLD,
          blue: "#7aa2f7",
          magenta: "#d6a4ff",
          cyan: "#7be0d0",
          white: PARCHMENT,
          brightYellow: "#ffd483",
        },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(hostRef.current);
      try {
        fit.fit();
      } catch {
        /* ignore pre-layout fit */
      }

      const post = (payload: Record<string, unknown>) =>
        fetch("/api/hermes/pty", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session, ...payload }),
        }).catch(() => {});

      // Keystrokes → PTY.
      term.onData((d: string) => void post({ type: "input", data: d }));

      // Keep PTY dimensions in sync with the rendered terminal.
      const syncSize = () => {
        try {
          fit.fit();
          void post({ type: "resize", cols: term.cols, rows: term.rows });
        } catch {
          /* ignore */
        }
      };
      resizeObs = new ResizeObserver(syncSize);
      resizeObs.observe(hostRef.current);

      const cols = term.cols || 80;
      const rows = term.rows || 24;
      es = new EventSource(
        `/api/hermes/pty?session=${encodeURIComponent(session)}&kind=${encodeURIComponent(
          kind
        )}&cols=${cols}&rows=${rows}`
      );
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; data?: string; message?: string };
          if (msg.type === "data" && msg.data) term.write(msg.data);
          else if (msg.type === "ready") {
            setStatus("live");
            syncSize();
          } else if (msg.type === "error") {
            term.write(`\r\n\x1b[31m${msg.message ?? "error"}\x1b[0m\r\n`);
          } else if (msg.type === "exit") {
            setStatus("ended");
          }
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects; surface as connecting until data resumes.
        setStatus("connecting");
      };

      term.focus();
    })();

    return () => {
      disposed = true;
      es?.close();
      resizeObs?.disconnect();
      term?.dispose();
    };
  }, [session, kind]);

  return (
    <div className="relative h-full w-full" style={{ background: OXBLOOD }}>
      <div ref={hostRef} className="h-full w-full px-3 py-2" />
      {status !== "live" && (
        <div
          className="pointer-events-none absolute right-3 top-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{
            color: status === "ended" ? "#ff8f8f" : GOLD,
            background: "rgba(0,0,0,0.35)",
          }}
        >
          {status === "ended" ? "session ended" : "connecting…"}
        </div>
      )}
    </div>
  );
}
