"use client";

import { MASCOTS } from "./mascots";
import { BACKGROUNDS } from "./backgrounds";
import { ClineEmblem } from "./mascots";

export interface Skin {
  Mascot: (p: { size?: number; className?: string }) => React.ReactElement;
  Emblem: (p: { size?: number; className?: string }) => React.ReactElement;
  Background: (p: { className?: string }) => React.ReactElement;
  /** Single-word mood shown as an eyebrow on the agent page. */
  mood: string;
  /** Classical serif title (Hermes) vs technical mono vs default sans. */
  type: "serif" | "mono" | "sans";
  /** Whether this agent renders the integrated-IDE layout. */
  ide?: boolean;
  /** Whether this agent renders its dedicated system-operations console. */
  console?: boolean;
  /** Whether this agent renders its dedicated oxblood+gold Hermes console. */
  hermes?: boolean;
  /** Whether this agent renders its dedicated noir Codex console. */
  codex?: boolean;
  /** Whether this agent renders its dedicated weightless jcode swarm cockpit. */
  swarm?: boolean;
}

const META: Record<string, { mood: string; type: Skin["type"]; ide?: boolean; console?: boolean; hermes?: boolean; codex?: boolean; swarm?: boolean }> = {
  claude: { mood: "Ember", type: "sans" },
  hermes: { mood: "Olympus", type: "serif", hermes: true },
  pi: { mood: "Laboratory", type: "mono" },
  cline: { mood: "Parallel", type: "mono" },
  antigravity: { mood: "Zero-G", type: "sans", ide: true },
  zcode: { mood: "Bloom", type: "sans" },
  openclaw: { mood: "Apex", type: "mono", console: true },
  jcode: { mood: "Swarm", type: "mono", swarm: true },
  vibe: { mood: "Resonance", type: "sans" },
  codex: { mood: "Cipher", type: "mono", codex: true },
  sentinel: { mood: "Vigil", type: "mono" },
};

const FALLBACK_BG = BACKGROUNDS.claude;
const FALLBACK_M = MASCOTS.claude;

// Emblems for the floating square — some agents want a simpler glyph than their full mascot.
const EMBLEMS: Record<string, Skin["Emblem"]> = {
  cline: ClineEmblem,
  hermes: MASCOTS.hermes,
  claude: MASCOTS.claude,
  pi: MASCOTS.pi,
  antigravity: MASCOTS.antigravity,
  zcode: MASCOTS.zcode,
  openclaw: MASCOTS.openclaw,
  jcode: MASCOTS.jcode,
  vibe: MASCOTS.vibe,
  codex: MASCOTS.codex,
  sentinel: MASCOTS.sentinel,
};

export function getSkin(id: string): Skin {
  const m = META[id] ?? { mood: "Agent", type: "sans" };
  const masc = MASCOTS[id] ?? FALLBACK_M;
  const bg = BACKGROUNDS[id] ?? FALLBACK_BG;
  // Default emblem is the same as mascot; agents can override via EMBLEMS map
  const emblem = EMBLEMS[id] ?? masc;
  return {
    Mascot: masc,
    Emblem: emblem,
    Background: bg,
    mood: m.mood,
    type: m.type,
    ide: m.ide,
    console: m.console,
    hermes: m.hermes,
    codex: m.codex,
    swarm: m.swarm,
  };
}

export const typeFontClass: Record<Skin["type"], string> = {
  serif: "font-serif",
  mono: "font-mono",
  sans: "",
};
