"use client";

import { MASCOTS } from "./mascots";
import { BACKGROUNDS } from "./backgrounds";

export interface Skin {
  Mascot: (p: { size?: number; className?: string }) => React.ReactElement;
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
  opencode: { mood: "Open Signal", type: "mono" },
  antigravity: { mood: "Zero-G", type: "sans", ide: true },
  openclaw: { mood: "Apex", type: "mono", console: true },
  jcode: { mood: "Swarm", type: "mono", swarm: true },
  vibe: { mood: "Resonance", type: "sans" },
  codex: { mood: "Cipher", type: "mono", codex: true },
  sentinel: { mood: "Vigil", type: "mono" },
};

const FALLBACK_BG = BACKGROUNDS.claude;
const FALLBACK_M = MASCOTS.claude;

export function getSkin(id: string): Skin {
  const m = META[id] ?? { mood: "Agent", type: "sans" };
  return {
    Mascot: MASCOTS[id] ?? FALLBACK_M,
    Background: BACKGROUNDS[id] ?? FALLBACK_BG,
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
