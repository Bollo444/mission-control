"use client";

import { useEffect, useState } from "react";

export default function SharedEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => setText(initial), [initial]);
  const dirty = text !== initial;

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "shared", content: text }),
      });
      setState(res.ok ? "ok" : "err");
      setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("err");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-[460px] w-full resize-y rounded-xl border bg-[var(--color-base)] p-4 font-mono text-[12px] leading-relaxed text-[var(--color-ink-2)] outline-none focus:border-[var(--color-ink-4)]"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || state === "saving"}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-[#0b0c0f] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--color-signal)" }}
        >
          {state === "saving" ? "Saving…" : "Save shared knowledge"}
        </button>
        <span className="text-xs text-[var(--color-ink-4)]">
          {state === "ok"
            ? "Saved ✓"
            : state === "err"
              ? "Save failed"
              : dirty
                ? "Unsaved changes"
                : "Synced with vault"}
        </span>
      </div>
    </div>
  );
}
