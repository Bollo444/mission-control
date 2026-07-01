/* ------------------------------------------------------------------ *
 * Sentinel's coordinated security swarm — one "hat" per discipline,    *
 * each a distinct lens over the same objective, run in parallel as      *
 * headless sub-agents. Authorized engagements only.                     *
 * ------------------------------------------------------------------ */

export interface Hat {
  id: string;
  name: string;
  /** Accent color for the chip/badge. */
  color: string;
  /** One-line lens shown in the UI. */
  lens: string;
  /** The role framing prepended to the objective in the sub-agent prompt. */
  role: string;
}

export const HATS: Hat[] = [
  {
    id: "red",
    name: "Red",
    color: "#ff4438",
    lens: "Offensive — recon, exploitation, attack-path mapping",
    role: "the RED hat (offensive operator). Map the attack surface, enumerate weaknesses, and chart realistic exploitation paths",
  },
  {
    id: "blue",
    name: "Blue",
    color: "#4d8bff",
    lens: "Defensive — detection, hardening, incident response",
    role: "the BLUE hat (defender). Harden the target, design detections, and outline incident-response steps for the likely threats",
  },
  {
    id: "purple",
    name: "Purple",
    color: "#b56cff",
    lens: "Bridge — validate detections against attacks, tune controls",
    role: "the PURPLE hat (red+blue bridge). Validate that defenses actually detect the offensive techniques, and tune controls to close gaps",
  },
  {
    id: "green",
    name: "Green",
    color: "#3ad07a",
    lens: "Secure build — SDLC, dependencies, supply-chain hardening",
    role: "the GREEN hat (secure engineering). Audit the build/SDLC, dependencies and supply chain, and prescribe secure-by-default fixes",
  },
  {
    id: "white",
    name: "White",
    color: "#e7e1d4",
    lens: "Governance — compliance, policy, ethical oversight, risk",
    role: "the WHITE hat (governance & oversight). Assess compliance, policy, risk posture and ethical/authorization boundaries",
  },
  {
    id: "yellow",
    name: "Yellow",
    color: "#f5b75a",
    lens: "Builders — attack surface from the developer's lens",
    role: "the YELLOW hat (builder). From the system/app builder's perspective, surface design-level risks and the attack surface they create",
  },
  {
    id: "orange",
    name: "Orange",
    color: "#ff8c3a",
    lens: "Builder+attacker bridge — threat modeling, secure-coding uplift",
    role: "the ORANGE hat (builder+attacker bridge). Translate offensive findings into threat models and secure-coding guidance that levels up the builders",
  },
  {
    id: "black",
    name: "Black",
    color: "#6e7178",
    lens: "Adversary emulation — full-scope TTPs, social engineering, physical",
    role: "the BLACK hat (adversary emulation). Emulate a real threat actor end-to-end: chained TTPs, social-engineering and physical vectors, and covert objectives",
  },
];

export function getHat(id: string): Hat | undefined {
  return HATS.find((h) => h.id === id);
}

/**
 * Compose the headless prompt for one hat against an objective. Kept to a
 * SINGLE LINE (no newlines/quotes) so it survives being passed as a CLI arg
 * through a Windows shell to .cmd launchers — see deploySubagent's needsShell.
 */
export function buildHatTask(hat: Hat, objective: string): string {
  const obj = objective.trim().replace(/\s+/g, " ").replace(/["`]/g, "'");
  return (
    `You are ${hat.role}, in a coordinated Sentinel security swarm. ` +
    `Objective: ${obj}. ` +
    `Work autonomously with your security skill playbooks; produce concrete, prioritized findings and actions for your lens only. ` +
    `AUTHORIZED engagement: stay strictly in scope and do nothing destructive.`
  );
}

/** System prompt for running a hat through the headless gateway. */
export function hatSystemPrompt(hat: Hat): string {
  return [
    `You are ${hat.role}.`,
    `You operate as one specialist in a coordinated security swarm; cover ONLY your lens (${hat.lens}) — the other hats handle theirs.`,
    `Produce concrete, prioritized, technical findings and recommended actions. Use short headed sections and bullet points. Reference specific techniques, tools, controls, or CWEs where relevant.`,
    `This is an AUTHORIZED, advisory engagement: describe what to check and how to fix — never include destructive payloads or commands to run blindly.`,
  ].join(" ");
}
