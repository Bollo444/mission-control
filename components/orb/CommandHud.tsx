"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AgentSummary } from "@/lib/types";
import { hexA } from "@/lib/format";
import { PETALS } from "./petals";

/* ------------------------------------------------------------------ *
 * Command HUD — pressing "/" fades the orb to glass and floats four    *
 * holographic panels that drift at the screen edges (Mass Effect).     *
 * Three group Hermes + the ops surfaces; one is the fleet, where every *
 * row wears its agent's own accent so you read the menu by color.      *
 * ------------------------------------------------------------------ */

const PETAL = Object.fromEntries(PETALS.map((p) => [p.id, p]));

// Angular corner cut — the holographic-panel silhouette.
const CLIP = "polygon(0 14px, 14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)";

type Corner = "tl" | "tr" | "bl" | "br";

interface Cluster {
  key: string;
  title: string;
  accent: string;
  corner: Corner;
  items?: string[]; // petal ids
  fleet?: boolean;
  delay: number;
  drift: number; // seconds
}

const CLUSTERS: Cluster[] = [
  { key: "hermes", title: "HERMES", accent: "#f5b75a", corner: "tl", items: ["console", "skills", "duo", "profiles", "artifacts", "sessions"], delay: 0.04, drift: 7 },
  { key: "fleet", title: "THE FLEET", accent: "#c4b3a0", corner: "tr", fleet: true, delay: 0.12, drift: 9 },
  { key: "knowledge", title: "KNOWLEDGE", accent: "#9d8cff", corner: "bl", items: ["memory", "meeting"], delay: 0.2, drift: 8 },
  { key: "operations", title: "OPERATIONS", accent: "#5cd6a0", corner: "br", items: ["automation", "gateway", "logs"], delay: 0.28, drift: 6.5 },
];

const CORNER_POS: Record<Corner, string> = {
  tl: "left-4 top-4 sm:left-8 sm:top-8",
  tr: "right-4 top-4 sm:right-8 sm:top-8",
  bl: "left-4 bottom-24 sm:left-8",
  br: "right-4 bottom-24 sm:right-8",
};

function Row({
  glyph,
  label,
  accent,
  onClick,
}: {
  glyph: string;
  label: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.04]"
      style={{ color: "var(--color-ink)" }}
    >
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px] transition-transform group-hover:scale-110"
        style={{ background: hexA(accent, 0.16), color: accent }}
      >
        {glyph}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}

export default function CommandHud({
  agents,
  onPick,
  onClose,
}: {
  agents: AgentSummary[];
  onPick: (petalId: string, accent: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const fleet = useMemo(() => agents, [agents]);

  return (
    // Transparent backdrop — the orb stays visible (glassy) behind. Click to dismiss.
    <div className="absolute inset-0 z-30" onClick={onClose}>
      {CLUSTERS.map((c) => (
        <div
          key={c.key}
          className={`mc-fade-in absolute ${CORNER_POS[c.corner]}`}
          style={{ animationDelay: `${c.delay}s` }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* inner wrapper drifts — the "living" Mass Effect float */}
          <div
            className="w-[clamp(200px,22vw,260px)] p-3"
            style={{
              clipPath: CLIP,
              background: `linear-gradient(158deg, ${hexA(c.accent, 0.12)}, rgba(8,8,12,0.82))`,
              boxShadow: `inset 0 0 0 1px ${hexA(c.accent, 0.45)}, 0 0 40px -12px ${hexA(c.accent, 0.4)}`,
              backdropFilter: "blur(8px)",
              animation: `mc-float ${c.drift}s ease-in-out infinite`,
              animationDelay: `${c.delay}s`,
            }}
          >
            {/* top accent edge */}
            <div className="mb-2.5 flex items-center gap-2 pb-2" style={{ borderBottom: `1px solid ${hexA(c.accent, 0.25)}` }}>
              <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: c.accent }}>
                ▸ {c.title}
              </span>
            </div>

            <div className="flex max-h-[42vh] flex-col gap-0.5 overflow-y-auto pr-1">
              {c.fleet
                ? fleet.map((a) => (
                    <Row
                      key={a.id}
                      glyph={a.glyph}
                      label={a.name}
                      accent={a.accent}
                      onClick={() => {
                        onClose();
                        router.push(`/agents/${a.id}`);
                      }}
                    />
                  ))
                : c.items?.map((id) => {
                    const p = PETAL[id];
                    if (!p) return null;
                    return (
                      <Row
                        key={id}
                        glyph={p.glyph}
                        label={p.label}
                        accent={c.accent}
                        onClick={() => onPick(id, c.accent)}
                      />
                    );
                  })}
            </div>
          </div>
        </div>
      ))}

      {/* dismiss hint */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-[0.2em] text-[var(--color-ink-4)]">
        esc / click to dismiss
      </div>
    </div>
  );
}
