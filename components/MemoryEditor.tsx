"use client";

import { useEffect, useState } from "react";
import { hexA } from "@/lib/format";

export default function MemoryEditor({
  agentId,
  initial,
  accent,
}: {
  agentId: string;
  initial: string;
  accent: string;
}) {
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState<"idle" | "saving" | "ok" | "err">("idle");

  useEffect(() => setText(initial), [initial]);

  const dirty = text !== initial;

  async function save() {
    setSaved("saving");
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "agent-memory", agentId, content: text }),
      });
      setSaved(res.ok ? "ok" : "err");
      setTimeout(() => setSaved("idle"), 1800);
    } catch {
      setSaved("err");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-72 w-full resize-y rounded-xl border bg-[var(--color-base)] p-4 font-mono text-[12px] leading-relaxed text-[var(--color-ink-2)] outline-none focus:border-[var(--color-ink-4)]"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saved === "saving"}
          className="rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: accent, color: "#0b0c0f" }}
        >
          {saved === "saving" ? "Saving…" : "Save to vault"}
        </button>
        <span className="text-xs text-[var(--color-ink-4)]">
          {saved === "ok"
            ? "Saved to Obsidian vault ✓"
            : saved === "err"
              ? "Save failed"
              : dirty
                ? "Unsaved changes"
                : "Synced with vault"}
        </span>
      </div>
      <p className="text-[11px] text-[var(--color-ink-4)]">
        This is the agent&apos;s note in the shared Obsidian vault. Markdown +{" "}
        <span style={{ color: hexA(accent, 0.9) }}>[[wikilinks]]</span> are
        preserved — edits here are visible to every other agent.
      </p>
    </div>
  );
}
