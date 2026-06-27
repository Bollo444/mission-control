"use client";

import { useState } from "react";
import { hexA } from "@/lib/format";
import DirPicker from "./DirPicker";

type Action = "launch" | "install";

export default function LaunchControls({
  id,
  accent,
  kind,
  installed,
  installCommand,
  installUnverified,
  onActed,
}: {
  id: string;
  accent: string;
  kind: string;
  installed: boolean;
  installCommand?: string | null;
  installUnverified?: boolean;
  onActed?: () => void;
}) {
  const [cwd, setCwd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function act(action: Action, dir?: string) {
    setBusy(true);
    setMsg(null);
    try {
      const where = dir ?? (cwd || undefined);
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, cwd: where, action }),
      });
      const json = await res.json();
      setMsg(json.message || (json.ok ? "Done." : "Failed."));
      onActed?.();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Picked a folder in the browser → remember it and launch there immediately.
  function launchIn(dir: string) {
    setPicking(false);
    setCwd(dir);
    void act("launch", dir);
  }

  const launchLabel = kind === "ide" ? "Open IDE" : "Launch session";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
          placeholder="Working directory (optional) e.g. C:\\path\\to\\project"
          className="min-w-0 flex-1 rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-4)] focus:border-[var(--color-ink-4)]"
        />
        <button
          disabled={busy || !installed}
          onClick={() => setPicking(true)}
          title="Browse for a project folder"
          className="rounded-lg border px-3 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-3)] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ borderColor: hexA(accent, 0.5) }}
        >
          🗀 Browse…
        </button>
        <button
          disabled={busy || !installed}
          onClick={() => act("launch")}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: accent, color: "#0b0c0f" }}
        >
          {busy ? "…" : launchLabel}
        </button>
        {!installed && installCommand && (
          <button
            disabled={busy}
            onClick={() => act("install")}
            className="rounded-lg border px-4 py-2 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-3)] disabled:opacity-40"
            style={{ borderColor: hexA(accent, 0.5) }}
          >
            Install
          </button>
        )}
      </div>

      {!installed && installCommand && (
        <div className="rounded-lg border border-dashed bg-[var(--color-surface-2)] px-3 py-2 font-mono text-xs text-[var(--color-ink-3)]">
          $ {installCommand}
          {installUnverified && (
            <span className="ml-2 rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10px] not-italic text-[var(--color-amber)]">
              verify package name first
            </span>
          )}
        </div>
      )}

      {msg && (
        <div
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: hexA(accent, 0.1), color: "var(--color-ink-2)" }}
        >
          {msg}
        </div>
      )}

      {picking && <DirPicker accent={accent} onPick={launchIn} onClose={() => setPicking(false)} />}
    </div>
  );
}
