"use client";

import Link from "next/link";
import type { AgentSummary } from "@/lib/types";
import { hexA, relTime } from "@/lib/format";
import { StatusPill, Kind } from "./ui";
import { getSkin, typeFontClass } from "./skins";

export default function AgentCard({ a, index }: { a: AgentSummary; index: number }) {
  const s = a.status;
  const skin = getSkin(a.id);
  const { Background, Mascot } = skin;

  return (
    <Link
      href={`/agents/${a.id}`}
      className="mc-rise mc-glow-edge group relative flex min-h-[212px] flex-col overflow-hidden rounded-[14px] border p-5 transition-transform duration-200 hover:-translate-y-0.5"
      style={{ animationDelay: `${index * 40}ms`, ["--glow"]: hexA(a.accent, 0.5) } as React.CSSProperties}
    >
      {/* unique animated background + readability scrim */}
      <Background className="opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,9,12,0.18) 0%, rgba(8,9,12,0.42) 55%, rgba(8,9,12,0.74) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${a.accent}, transparent)` }}
      />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 place-items-center">
            <Mascot size={56} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-semibold tracking-tight ${typeFontClass[skin.type]}`}>
                {a.name}
              </span>
              <Kind kind={a.kind} />
            </div>
            <div className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink-4)]">
              {skin.mood}
            </div>
          </div>
        </div>
        <StatusPill on={s.installed} labelOn="ready" accent={a.accent} />
      </div>

      <p className="relative mt-3 line-clamp-2 text-sm text-[var(--color-ink-2)]">
        {a.tagline}
      </p>

      <div className="relative mt-auto flex items-end justify-between border-t border-white/10 pt-3">
        <div className="flex gap-6">
          <div>
            <div className="mc-stat-value text-lg leading-none" style={{ color: a.accent }}>
              {s.sessionCount}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">
              sessions
            </div>
          </div>
          <div>
            <div className="mc-stat-value text-lg leading-none" style={{ color: a.accent }}>
              {s.version ? s.version.split(" ")[0].replace(/^v/, "").slice(0, 8) : "—"}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">
              version
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--color-ink-2)]">{relTime(s.lastActive)}</div>
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-ink-4)]">
            last active
          </div>
        </div>
      </div>
    </Link>
  );
}
