"use client";

import Link from "next/link";
import type { ActivityEntry, NavAgent } from "@/lib/types";
import { clockTime, hexA, relTime } from "@/lib/format";

export default function ActivityFeed({
  entries,
  accentFor,
  compact,
}: {
  entries: ActivityEntry[];
  accentFor: (id: string) => string;
  compact?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-[var(--color-ink-4)]">
        No shared activity yet. Launching an agent writes the first entry to the
        Obsidian vault.
      </div>
    );
  }
  return (
    <ol className="relative flex flex-col">
      {entries.map((e, i) => {
        const accent = accentFor(e.agentId);
        return (
          <li
            key={`${e.ts}-${i}`}
            className="relative flex gap-3 pl-5"
          >
            <span
              className="absolute left-[3px] top-1.5 h-2 w-2 rounded-full"
              style={{ background: accent, boxShadow: `0 0 0 3px ${hexA(accent, 0.16)}` }}
            />
            {i < entries.length - 1 && (
              <span
                className="absolute left-[6px] top-3 w-px"
                style={{ height: "calc(100% - 4px)", background: "var(--color-line)" }}
              />
            )}
            <div className={compact ? "pb-3" : "pb-4"}>
              <div className="text-sm">
                <Link
                  href={`/agents/${e.agentId}`}
                  className="font-semibold"
                  style={{ color: accent }}
                >
                  {e.agentName}
                </Link>{" "}
                <span className="text-[var(--color-ink-2)]">{e.action}</span>
                {e.detail && (
                  <span className="text-[var(--color-ink-4)]"> · {e.detail}</span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--color-ink-4)]">
                {clockTime(e.ts)} · {relTime(e.ts)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function makeAccentLookup(nav: NavAgent[]) {
  const map = new Map(nav.map((a) => [a.id, a.accent]));
  return (id: string) => map.get(id) ?? "var(--color-signal)";
}
