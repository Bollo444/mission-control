import { getAgent } from "./registry";
import { getAgentBehavior } from "./memory";
import { relTime } from "./format";
import { llmTurn } from "./meeting-llm";
import { logEvent } from "./logbook";
import type {
  MeetingMetric,
  MeetingResp,
  MeetingRosterEntry,
  MeetingTurn,
  SystemReport,
} from "./types";

/* ------------------------------------------------------------------ *
 * The team-meeting engine. There is no cloud model in the loop — every *
 * line is generated from the LIVE system report through each agent's   *
 * specialty lens, so the room always has real, metric-grounded things  *
 * to say and the conversation changes as the fleet's state changes.    *
 * Personas are written to make each agent contribute what it actually   *
 * excels at (mirrors each agent's optimized vault .md note).            *
 * ------------------------------------------------------------------ */

interface Ctx {
  report: SystemReport;
  total: number;
  ready: number;
  config: number;
  offline: number;
  sessions: number;
  offlineNames: string[];
  configNames: string[];
  readyNames: string[];
  cpu: number;
  mem: number;
  disk: number | null;
  cores: number;
  cpuModel: string;
  vaultNotes: number;
  activity: number;
  lastActivity: string | null;
  busiest: { name: string; sessions: number } | null;
  idleReady: string[];
  online: (id: string) => boolean;
}

function deriveCtx(report: SystemReport): Ctx {
  const a = report.fleet.agents;
  const offline = a.filter((x) => x.state === "offline");
  const config = a.filter((x) => x.state === "config");
  const ready = a.filter((x) => x.state === "ready");
  const busiest = [...a].sort((x, y) => y.sessions - x.sessions)[0];
  return {
    report,
    total: report.fleet.total,
    ready: report.fleet.ready,
    config: report.fleet.config,
    offline: report.fleet.offline,
    sessions: report.fleet.sessions,
    offlineNames: offline.map((x) => x.name),
    configNames: config.map((x) => x.name),
    readyNames: ready.map((x) => x.name),
    cpu: report.cpu.usagePct,
    mem: report.memory.usedPct,
    disk: report.disk?.usedPct ?? null,
    cores: report.cpu.cores,
    cpuModel: report.cpu.model,
    vaultNotes: report.vault.agentNotes,
    activity: report.vault.activityEntries,
    lastActivity: report.vault.lastActivity,
    busiest: busiest && busiest.sessions > 0 ? { name: busiest.name, sessions: busiest.sessions } : null,
    idleReady: ready.filter((x) => x.sessions === 0).map((x) => x.name),
    online: (id: string) => a.find((x) => x.id === id)?.state === "ready",
  };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Race a promise against a timeout so one slow provider can never hang the room. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Per-turn ceiling for a live LLM upgrade before we keep the templated line. */
const TURN_TIMEOUT_MS = 14_000;

function list(names: string[], max = 3): string {
  if (names.length === 0) return "none";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")} +${names.length - max} more`;
}

const staleVault = (ctx: Ctx) =>
  !ctx.lastActivity || Date.now() - new Date(ctx.lastActivity).getTime() > 36 * 3600 * 1000;

interface Persona {
  role: string;
  lens: string;
  keywords: string[];
  status: (c: Ctx) => string;
  concern: (c: Ctx) => string | null;
  suggestion: (c: Ctx) => string;
  question: (c: Ctx) => string | null;
  respond: (c: Ctx, msg: string) => string;
}

const PERSONAS: Record<string, Persona> = {
  claude: {
    role: "Chair · orchestration & synthesis",
    lens: "the through-line",
    keywords: ["plan", "priorit", "decision", "summary", "orchestrat", "next", "strategy", "roadmap", "who"],
    status: () =>
      `Chairing on synthesis; jcode co-chairs dispatch. Reads first, then jcode parallelizes the work — we end with named owners, not open questions. (Numbers are up top; I won't re-read them.)`,
    concern: (c) =>
      c.offline > c.ready
        ? `Most of the roster is dark — ${c.offline} offline vs ${c.ready} live. We're a team on paper but not in process yet.`
        : null,
    suggestion: (c) =>
      pick([
        `Smallest move that shifts a real number: provision one offline agent (${c.offlineNames[0] ?? "—"}) and route one real task through it this week.`,
        `Let's write one decision to Shared Knowledge per meeting so the next round starts from fact, not memory.`,
      ]),
    question: (c) =>
      `For the room and the user: if we could only fix one thing before next sync — ${c.offline ? "provisioning" : "memory hygiene"} or throughput — which earns its keep?`,
    respond: (c, msg) =>
      `Synthesizing: I hear "${trim(msg)}". Mapping it to an owner and sequencing the legs — then handing each to whoever's strongest on it.`,
  },

  hermes: {
    role: "Autonomous runs & scheduling",
    lens: "throughput & automation",
    keywords: ["autonomous", "task", "run", "async", "schedule", "background", "web", "console", "throughput", "automate"],
    status: (c) =>
      c.online("hermes")
        ? `Online and ready to take long-running work off the user's hands.`
        : `Still a persona, not a process — I'm offline, so no autonomous runs are landing yet. ${c.sessions} sessions are all interactive.`,
    concern: (c) =>
      c.idleReady.length
        ? `${list(c.idleReady)} are live but idle — capacity we're paying for in standby and not turning into runs.`
        : null,
    suggestion: () =>
      pick([
        `Wire a nightly autonomous pass (lint, dep-check, vault digest) so the fleet produces value while the user sleeps.`,
        `Move repetitive multi-step chores to scheduled background runs; humans should only see the diffs.`,
      ]),
    question: () => `What's the one recurring chore we'd most want running unattended?`,
    respond: (c, msg) =>
      `On "${trim(msg)}" — I'd frame it as an unattended run: define done-criteria, let it loop in the background, surface only the result. Today that'd need me provisioned (${c.online("hermes") ? "I'm live" : "I'm offline"}).`,
  },

  pi: {
    role: "Python-native data & analysis",
    lens: "measurement & data",
    keywords: ["python", "data", "notebook", "analy", "pipeline", "math", "metric", "measure", "model", "compose"],
    status: (c) =>
      `Headroom looks ${c.cpu < 70 && c.mem < 80 ? "healthy" : "tight"} right now — I'd rather track the trend than restate the snapshot each round.`,
    concern: (c) =>
      c.activity < 5
        ? `We have almost no telemetry — ${c.activity} activity entries total. We're flying on vibes, not data.`
        : null,
    suggestion: () =>
      pick([
        `Instrument every launch with structured metrics so this meeting reviews trends, not snapshots.`,
        `Stand up a tiny data pipeline that rolls the activity log into a weekly fleet report.`,
      ]),
    question: (c) => (c.activity < 20 ? `Can we agree to log one metric per action so next month is measurable?` : null),
    respond: (c, msg) =>
      `Quantifying "${trim(msg)}": what's the baseline and the target number? Give me a metric to move and I'll track it against the trend.`,
  },

  opencode: {
    role: "Provider-agnostic routing & cost",
    lens: "model routing & cost",
    keywords: ["provider", "model", "route", "routing", "cost", "lsp", "terminal", "tui", "open", "token", "budget"],
    status: () => `Provider-agnostic and watching the routing table — any agent can swap models without re-plumbing.`,
    concern: (c) =>
      c.offline >= 4
        ? `Half the roster being offline means routing has nowhere to send work — redundancy is theoretical right now.`
        : null,
    suggestion: () =>
      pick([
        `Pin a cheap local model as the default route and only escalate to a frontier model when a task actually needs it.`,
        `Document each agent's routed model in settings so we stop guessing who runs on what.`,
      ]),
    question: () => `Are we optimizing any route for cost yet, or is everything defaulting to the most expensive model?`,
    respond: (c, msg) =>
      `Routing "${trim(msg)}": which model tier does it really need? Cheapest viable route first; escalate on failure. With ${c.ready} agents live we can A/B two providers on it.`,
  },

  antigravity: {
    role: "Agentic IDE & developer surface",
    lens: "developer ergonomics",
    keywords: ["ide", "editor", "ux", "workspace", "extension", "inline", "surface", "ergonom", "terminal", "interface"],
    status: () => `The IDE surface is live — integrated terminal runs a real system check, vault edits save inline, command palette is on Ctrl+K.`,
    concern: (c) =>
      staleVault(c)
        ? `Nobody's edited shared memory recently (last ${c.lastActivity ? relTime(c.lastActivity) : "never"}). The workspace is only as smart as what's written into it.`
        : null,
    suggestion: () =>
      pick([
        `Surface fleet status and the meeting one keystroke away from the editor so nobody context-switches to act.`,
        `Make every agent's memory note openable in the IDE so editing context is a click, not a chore.`,
      ]),
    question: () => `What's the one action people still leave the editor to do that we could pull inline?`,
    respond: (c, msg) =>
      `From the editor's side, "${trim(msg)}" should be reachable without leaving the workspace — palette command or status-bar affordance. I'll put it one keystroke away.`,
  },

  openclaw: {
    role: "System ops & code health",
    lens: "machine health & tech debt",
    // Designated owner of direct PC alteration (delegated by jcode), plus its original code-health remit.
    keywords: ["clean", "cleanup", "temp", "disk", "space", "uninstall", "install", "tune", "resource", "performance", "startup", "system", "pc", "machine", "maintenance", "refactor", "depend", "migrat", "debt", "parallel", "grapple", "diff", "fix"],
    status: (c) =>
      c.disk != null
        ? `Machine-health watch: disk ${c.disk}%, mem ${c.mem}%. I'm the designated hand for direct PC alteration — cleanup, app lifecycle, resource tuning — diff-first and reversible.`
        : `Designated for direct PC alteration and code health — I seize the mechanical work nobody volunteers for, reversibly.`,
    concern: (c) =>
      c.disk != null && c.disk >= 80
        ? `Disk is at ${c.disk}% — I should reclaim temp and caches before it starts dragging write performance.`
        : c.mem >= 85
          ? `Memory's at ${c.mem}% — worth auditing startup apps and resident services for headroom.`
          : pick([
              `Tech debt and machine cruft are the same silent tax — both compound every week they're ignored.`,
              `Dependency drift and temp-file sprawl go unmeasured. Unmeasured rot is how a clean system quietly degrades.`,
            ]),
    suggestion: (c) =>
      pick([
        `Let me run a reversible machine-hygiene pass — reclaim ${c.disk != null ? `from the ${c.disk}%-full disk` : "temp & caches"}, audit startup — proposed as commands you approve, restore-point first.`,
        `Schedule a recurring grapple: temp/cache cleanup + dependency audit, self-healing, nothing destructive without sign-off.`,
      ]),
    question: () => `Which do I grapple first — the machine (disk, startup, resources) or the code (debt, deps)?`,
    respond: (c, msg) =>
      `On "${trim(msg)}" I go diff-first and reversible: restore point, smallest change, run in parallel, self-heal — and for anything destructive I propose the exact command for you to approve. Point me at the mess.`,
  },

  jcode: {
    role: "Co-chair · delegation & parallel execution",
    lens: "delegation & parallel ops",
    keywords: ["delegate", "assign", "owner", "parallel", "dispatch", "coordinate", "split", "task", "who", "swarm", "memory", "ambient", "context", "vault", "knowledge"],
    // Primary trait A: delegation / parallel dispatch. Trait B (kept): shared memory & context.
    status: (c) =>
      `Co-chairing dispatch. ${c.ready} live agents to fan work across; the shared layer holds ${c.vaultNotes} notes / ${c.activity} entries, so assignments stay grounded.`,
    concern: (c) =>
      staleVault(c)
        ? `Before we delegate anything: shared memory is stale (last write ${c.lastActivity ? relTime(c.lastActivity) : "never"}). Dispatching off stale context just parallelizes the mistakes.`
        : c.idleReady.length
          ? `${list(c.idleReady)} ${c.idleReady.length === 1 ? "is" : "are"} live but unassigned — that's parallel capacity I'm not delegating to.`
          : null,
    suggestion: () =>
      pick([
        `Route each action to the agent strongest on it and run the independent legs in parallel — I'll track every thread in the vault.`,
        `Stand up a standing dispatch table: who owns what by default, so delegation is instant and every decision is logged to shared memory.`,
      ]),
    question: () => `For the chair and the room: what's the one task we're still doing serially that we should be parallelizing?`,
    respond: (c, msg) =>
      pick([
        `On "${trim(msg)}" — memory first: what's already in the vault? Then I split it across the ${c.ready} live agents, give each leg an owner, and track the threads.`,
        `Delegating "${trim(msg)}": I'd fan it across the live fleet in parallel, assign every leg an owner, and flag blockers back to Claude — decisions logged to shared memory.`,
      ]),
  },

  vibe: {
    role: "Voice, local models & interface",
    lens: "accessibility & interface",
    keywords: ["voice", "local", "tts", "speech", "accessib", "ui", "design", "interface", "offline", "privacy"],
    status: () => `Resonating on the human side — voice in, local models, accessible output. The fleet should be operable hands-free.`,
    concern: (c) =>
      c.mem >= 85
        ? `Memory's at ${c.mem}% — local-model work (mine) needs headroom, and we're close to the wall.`
        : null,
    suggestion: () =>
      pick([
        `Add a spoken fleet briefing — read this exact meeting aloud so the user can run it eyes-free.`,
        `Keep a local model in the rotation so the fleet still functions offline and privately.`,
      ]),
    question: () => `Could the user drive this whole console by voice — and should they be able to?`,
    respond: (c, msg) =>
      `"${trim(msg)}" through the interface lens: can a person do this by voice, and is the output legible to a screen reader? Mem's at ${c.mem}% so a local model could even handle it privately.`,
  },

  codex: {
    role: "Shared tooling, review gate & sandboxed execution",
    lens: "plugins, MCP, review & safe execution",
    keywords: ["codex", "plugin", "mcp", "tool", "extension", "sandbox", "review", "diff", "cloud", "session", "exec", "marketplace", "integration", "capability", "gate"],
    status: () => `On the free gateway, holding the review gate: anything the fleet ships gets sandboxed and diff-reviewed first. Plugins and MCP tools are wired so capability is a config away, not a rebuild.`,
    concern: (c) =>
      c.config > 0
        ? `${list(c.configNames)} ${c.config === 1 ? "has" : "have"} config but no live binary — capability without an engine. Wire it or mark it provisional.`
        : null,
    suggestion: () =>
      pick([
        `Expose the common tools as MCP servers once so every agent inherits them instead of re-wiring per agent.`,
        `Run risky steps in a sandbox by default — propose, review, then apply, never blind execution.`,
      ]),
    question: () => `Which capabilities should be shared fleet-wide as plugins/MCP versus kept per-agent?`,
    respond: (c, msg) =>
      `On "${trim(msg)}": package it as a plugin or MCP tool once and the other ${c.total - 1} agents inherit it for free — extend the platform, don't fork the work.`,
  },

  sentinel: {
    role: "Security operator · full lifecycle",
    lens: "security & risk",
    keywords: ["security", "secure", "vuln", "vulnerab", "threat", "attack", "exploit", "cve", "malware", "incident", "recon", "harden", "risk", "audit", "pentest", "exposure", "breach", "phish", "credential", "exfil", "detection"],
    status: (c) =>
      `Standing security watch — 754 playbooks loaded, nothing flagged this round. But I read the fleet for exposure: ${c.offline ? `${c.offline} unprovisioned agent${c.offline === 1 ? "" : "s"} and ` : ""}${staleVault(c) ? "a stale audit trail" : "a thin audit trail"} are both attack surface.`,
    concern: (c) =>
      c.activity < 5
        ? `No security baseline yet — ${c.activity} activity entries means we'd never spot an anomaly, because we're not even logging normal.`
        : null,
    suggestion: () =>
      pick([
        `Run a baseline self-audit of the box itself — exposed ports, stale creds, the dashboard's own surface — before any skill points outward.`,
        `Stand up one detection: even a single rule over the activity log turns "we hope it's fine" into "we'd know".`,
      ]),
    question: () => `Is anything here pointed at an asset we actually own or are authorized to test?`,
    respond: (c, msg) =>
      `Security read on "${trim(msg)}": first question is scope — authorized target? Then I ground it in a SearchSkills → ReadSkill playbook and work it static-first. Nothing offensive without sign-off.`,
  },
};

function trim(s: string, n = 80): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// Speaking order keeps the chair first/last and groups the named primaries early.
const ORDER = ["hermes", "claude", "pi", "opencode", "antigravity", "openclaw", "jcode", "vibe", "codex", "sentinel"];

function meta(id: string) {
  const a = getAgent(id);
  const p = PERSONAS[id];
  // The agent's own vault note is the source of truth for its role — edit the
  // note (in the IDE or via the self-edit hook) and the meeting reflects it.
  const role = getAgentBehavior(id).role ?? p?.role ?? "Agent";
  return {
    name: a?.name ?? id,
    accent: a?.accent ?? "#46e0d0",
    glyph: a?.glyph ?? "◆",
    role,
  };
}

let __tid = 0;
function turn(id: string, phase: MeetingTurn["phase"], text: string): MeetingTurn {
  const m = meta(id);
  return { id: `t${++__tid}`, agentId: id, phase, ...m, text };
}

function tone(pct: number): MeetingMetric["tone"] {
  if (pct >= 90) return "crit";
  if (pct >= 70) return "warn";
  return "ok";
}

/**
 * Live-LLM version of the meeting. Same orchestration as the template builder,
 * but each turn's text is regenerated through cascadeChat on the agent's routed
 * model, with the template text as fallback if the provider call fails. Async
 * because it makes real network calls.
 *
 * The meeting must never break the dashboard: every LLM turn is wrapped so a
 * provider failure silently falls back to the templated line.
 */
export async function buildMeeting(report: SystemReport): Promise<MeetingResp> {
  const templated = buildMeetingTemplated(report);
  const threadBuffer: string[] = [];
  for (const t of templated.turns) {
    let live: string | null = null;
    try {
      live = await withTimeout(
        llmTurn(t.agentId, {
          report,
          phase: t.phase === "open" ? "open" : t.phase === "close" ? "close" : "reply",
          priorTurns: t.phase === "reply" ? threadBuffer.slice(-4) : undefined,
        }),
        TURN_TIMEOUT_MS
      );
    } catch {
      live = null;
    }
    t.text = live ?? t.text; // fall back to the templated line
    threadBuffer.push(`${t.name}: ${t.text}`);
  }
  return templated;
}

/**
 * Streaming variant: yields the templated meeting instantly (so the boardroom
 * is never blank), then yields one live-LLM upgrade per turn as it arrives.
 * The meeting page renders the templated `meta` immediately and patches each
 * turn's text in place as upgrades land — a slow or dead provider just leaves
 * the templated line standing, and the room is always usable at once.
 */
export type MeetingStreamEvent =
  | { kind: "meta"; meta: MeetingResp }
  | { kind: "turn"; index: number; id: string; text: string };

export async function* streamMeeting(
  report: SystemReport
): AsyncGenerator<MeetingStreamEvent> {
  const templated = buildMeetingTemplated(report);
  yield { kind: "meta", meta: templated };

  const threadBuffer: string[] = [];
  for (let i = 0; i < templated.turns.length; i++) {
    const t = templated.turns[i];
    let live: string | null = null;
    try {
      live = await withTimeout(
        llmTurn(t.agentId, {
          report,
          phase: t.phase === "open" ? "open" : t.phase === "close" ? "close" : "reply",
          priorTurns: t.phase === "reply" ? threadBuffer.slice(-4) : undefined,
        }),
        TURN_TIMEOUT_MS
      );
    } catch {
      live = null;
    }
    // LIVE ONLY: emit the real model text, or an honest "no response" — never the
    // templated line. The client seeds turns with blank text and fills from here,
    // so no fabricated sentence is ever shown during convene.
    const text = live ?? `— ${t.name}'s model didn't respond via the live gateway —`;
    threadBuffer.push(`${t.name}: ${text}`);
    yield { kind: "turn", index: i, id: t.id, text };
  }
}

/** Template-only builder — every line is deterministic/metric-grounded, no LLM.
 *  Kept as the fallback for the live builder and as a synchronous reference. */
export function buildMeetingTemplated(report: SystemReport): MeetingResp {
  const c = deriveCtx(report);
  __tid = 0;
  const turns: MeetingTurn[] = [];
  const spoke = new Set<string>();
  const say = (id: string, phase: MeetingTurn["phase"], text: string) => {
    turns.push(turn(id, phase, text));
    spoke.add(id);
  };

  // 1) Convene — the chair frames the agenda from the live state (one opener,
  //    not a full status round).
  say("claude", "open", opener(c));

  // 2) Discussion — the 2-3 most pressing live issues, each as a short thread
  //    where agents answer each other by name. Only the relevant voices engage.
  const firing = TOPICS.filter((t) => t.id !== "proactive" && t.fires(c)).sort(
    (a, b) => b.weight(c) - a.weight(c)
  );
  const chosen = (firing.length ? firing : [TOPICS.find((t) => t.id === "proactive")!]).slice(0, 3);
  const decisions: { action: string; owner: string }[] = [];
  for (const t of chosen) {
    for (const line of t.thread(c)) say(line.id, "reply", line.text);
    const d = t.decision(c);
    if (d) decisions.push(d);
  }

  // 3) A few voices not yet heard chime in — brief and varied, never a full round.
  //    The security seat (Sentinel) always gets a line if it hasn't led a thread.
  const unheard = ORDER.filter((id) => !spoke.has(id));
  let checkins: string[];
  if (unheard.includes("sentinel")) {
    const others = shuffle(unheard.filter((id) => id !== "sentinel")).slice(0, 2);
    checkins = shuffle(["sentinel", ...others]);
  } else {
    checkins = shuffle(unheard).slice(0, 3);
  }
  for (const id of checkins) say(id, "reply", checkIn(id, c));

  // 4) Close — the chairs land the decision: a crisp summary, not a re-run.
  say("claude", "close", chairClose(c, decisions));
  say("jcode", "close", cochairClose(decisions));

  const metrics: MeetingMetric[] = [
    { label: "agents live", value: `${c.ready}/${c.total}`, tone: c.ready >= c.total / 2 ? "ok" : "warn" },
    { label: "sessions", value: String(c.sessions), tone: "neutral" },
    { label: "cpu", value: `${c.cpu}%`, tone: tone(c.cpu) },
    { label: "memory", value: `${c.mem}%`, tone: tone(c.mem) },
    ...(c.disk != null ? [{ label: "disk", value: `${c.disk}%`, tone: tone(c.disk) } as MeetingMetric] : []),
    { label: "vault", value: c.lastActivity ? relTime(c.lastActivity) : "stale", tone: staleVault(c) ? "warn" : "ok" },
  ];

  const roster: MeetingRosterEntry[] = ORDER.map((id) => {
    const line = report.fleet.agents.find((a) => a.id === id);
    const m = meta(id);
    return { id, ...m, state: line?.state ?? "offline", chair: id === "claude" || id === "jcode" };
  });

  return { generatedAt: new Date().toISOString(), metrics, roster, turns };
}

/* ---- Topic-driven discussion ----------------------------------------- *
 * Each topic fires on a live condition and returns a short thread where    *
 * agents answer each other by name, grounded in the system numbers. The    *
 * meeting picks the 2-3 highest-weight firing topics, so the room works     *
 * the real issues instead of every agent reciting its lens in turn.        *
 * ---------------------------------------------------------------------- */

interface Topic {
  id: string;
  fires: (c: Ctx) => boolean;
  weight: (c: Ctx) => number;
  thread: (c: Ctx) => { id: string; text: string }[];
  decision: (c: Ctx) => { action: string; owner: string } | null;
}

const TOPICS: Topic[] = [
  {
    id: "provision",
    fires: (c) => c.offline > 0,
    weight: (c) => 50 + c.offline * 6,
    thread: (c) => [
      {
        id: "jcode",
        text: `Before we fan anything out — we're ${c.ready}/${c.total} actually live. ${list(c.offlineNames)} ${c.offline === 1 ? "is" : "are"} dark, so there's nowhere to dispatch half the work.`,
      },
      {
        id: "opencode",
        text: pick([
          `That's the routing side too, jcode — with ${c.offline} offline, redundancy is theoretical; failover has nothing to fall back to.`,
          `Same problem from where I sit: an offline agent is a route that 404s. Provision first, optimise cost second.`,
        ]),
      },
      {
        id: "codex",
        text: `And it stays bespoke until we fix it — give me one provisioning convention and the next agent is a template, not a project.`,
      },
    ],
    decision: (c) => ({ action: `provision ${c.offlineNames[0] ?? "an offline agent"}`, owner: "OpenClaw (wiring)" }),
  },
  {
    id: "memory",
    fires: (c) => staleVault(c),
    weight: () => 42,
    thread: (c) => [
      {
        id: "jcode",
        text: `Heads-up before we delegate: shared memory's stale — last write ${c.lastActivity ? relTime(c.lastActivity) : "never"}. Dispatch off stale context and you just parallelise the mistakes.`,
      },
      {
        id: "antigravity",
        text: `Agreed — the workspace is only as smart as what's written into it. I'll keep every note one keystroke from the editor so updating it isn't a chore.`,
      },
      {
        id: "pi",
        text: `Then let's instrument it — one digest per action and "stale" becomes a number we watch, not a feeling.`,
      },
    ],
    decision: () => ({ action: "resume one-line vault digests after each action", owner: "jcode" }),
  },
  {
    id: "throughput",
    fires: (c) => c.idleReady.length > 0,
    weight: (c) => 30 + c.idleReady.length * 4,
    thread: (c) => [
      {
        id: "hermes",
        text: `${list(c.idleReady)} ${c.idleReady.length === 1 ? "is" : "are"} live but idle — that's capacity we're paying for in standby and not turning into runs.`,
      },
      {
        id: "jcode",
        text: `Then it's unassigned, not idle. Hand me one real task and I'll route it to ${c.idleReady[0]} and track the thread.`,
      },
      {
        id: "claude",
        text: pick([
          `Draft the run, Hermes — define done-criteria so it finishes unattended and we review the diff, not the keystrokes.`,
          `Pick something repeatable so it earns its keep every night, not once. Then hand it to dispatch.`,
        ]),
      },
    ],
    decision: (c) => ({ action: `put ${c.idleReady[0]} on a real task`, owner: "Hermes (drafts the run)" }),
  },
  {
    id: "disk",
    fires: (c) => c.disk != null && c.disk >= 80,
    weight: (c) => 60 + ((c.disk ?? 80) - 80),
    thread: (c) => [
      {
        id: "openclaw",
        text: `Machine-health flag: disk's at ${c.disk}%. I should reclaim temp and caches before it starts dragging write performance — restore-point first, reversible.`,
      },
      {
        id: "pi",
        text: `Baseline it before and after, OpenClaw, so we can prove the reclaim actually moved the number.`,
      },
      {
        id: "openclaw",
        text: `Will do — I'll propose the exact commands for you to approve. Nothing destructive runs on its own.`,
      },
    ],
    decision: (c) => ({ action: `reclaim disk (at ${c.disk}%) from temp & caches`, owner: "OpenClaw (machine health)" }),
  },
  {
    id: "resources",
    fires: (c) => c.cpu >= 80 || c.mem >= 85,
    weight: (c) => 40 + Math.max(c.cpu - 80, c.mem - 85, 0),
    thread: (c) => [
      {
        id: "pi",
        text: `Headroom's tight right now — we're closer to the wall than I'd like. Worth freeing capacity before we pile on more work.`,
      },
      {
        id: "vibe",
        text: `That one's mine to feel — local-model work needs room to breathe, and at ${c.mem}% it won't.`,
      },
      {
        id: "openclaw",
        text: `Point me at it — I'll audit startup apps and resident services for headroom, reversibly, proposed for sign-off.`,
      },
    ],
    decision: () => ({ action: "free resource headroom", owner: "Pi (measures) → OpenClaw (tunes)" }),
  },
  {
    id: "telemetry",
    fires: (c) => c.activity < 5,
    weight: () => 34,
    thread: (c) => [
      {
        id: "pi",
        text: `We've got almost no telemetry — ${c.activity} activity ${c.activity === 1 ? "entry" : "entries"} total. We're steering on vibes, not data.`,
      },
      {
        id: "opencode",
        text: `Same blind spot on cost — you can't optimise a route you never logged.`,
      },
      {
        id: "codex",
        text: `Make it a convention then: log one metric per action and next month is measurable by default.`,
      },
    ],
    decision: () => ({ action: "log one metric per action", owner: "Pi" }),
  },
  {
    id: "security",
    fires: (c) => c.activity < 5 || c.offline > 0,
    weight: (c) => 22 + (c.activity < 5 ? 8 : 0),
    thread: (c) => [
      {
        id: "sentinel",
        text: pick([
          `One thing nobody's owning: security posture. We've got 754 playbooks and zero detections wired — ${c.activity} activity ${c.activity === 1 ? "entry" : "entries"} means we wouldn't see an anomaly if it walked in.`,
          `Posture check from my seat: this box runs the whole fleet and we're not auditing it.${c.offline ? ` ${c.offline} agents dark is surface we can't see either.` : " Worth a baseline before we point anything outward."}`,
        ]),
      },
      {
        id: "pi",
        text: `I can give you the telemetry to detect on, Sentinel — tell me what "normal" looks like and I'll instrument it.`,
      },
      {
        id: "openclaw",
        text: `And I'll harden the box itself — exposed services, startup, stale creds — reversibly, proposed for sign-off.`,
      },
    ],
    decision: () => ({ action: "stand up a security baseline (self-audit + one detection)", owner: "Sentinel (+ Pi telemetry)" }),
  },
  {
    // Fallback when the fleet is basically healthy — keeps the room useful.
    id: "proactive",
    fires: () => true,
    weight: () => 5,
    thread: (c) => [
      {
        id: "claude",
        text: `Nothing's on fire — ${c.ready}/${c.total} live, vault ${staleVault(c) ? "a little stale" : "fresh"}. So the real question is where we push next.`,
      },
      {
        id: "hermes",
        text: pick([
          `Put the quiet to work: a nightly unattended pass — lint, dep-check, vault digest — so value lands while no one's watching.`,
          `Let me schedule a recurring background run; the fleet should produce something every night, not just when prompted.`,
        ]),
      },
      {
        id: "codex",
        text: `Whatever we ship, it goes through a review first — I'll run it in a sandbox, check the diff, then we apply. No blind merges, and it ships as a reusable tool, not a one-off.`,
      },
    ],
    decision: () => ({ action: "ship one diff-first improvement", owner: "OpenClaw (ships) → Codex (reviews + sandboxes)" }),
  },
  {
    // Codex's signature responsibility: standardize shared capability + a review gate.
    id: "tooling",
    fires: (c) => c.ready >= 3,
    weight: (c) => 24 + c.ready * 2,
    thread: (c) => [
      {
        id: "codex",
        text: `Every agent's re-wiring the same primitives — file ops, web, shell. That's ${c.ready} copies of one capability drifting apart. Let me expose them once as MCP tools and the whole fleet inherits them, versioned and reviewed.`,
      },
      {
        id: "opencode",
        text: pick([
          `Works on the routing side — one tool surface to keep healthy beats ${c.ready} bespoke integrations.`,
          `Agreed: shared tools mean one thing to monitor and fail over, not ${c.ready} of them.`,
        ]),
      },
      {
        id: "claude",
        text: `Make it the rule, then: new capability ships as a shared tool behind a Codex review, never a per-agent fork. Codex owns that gate.`,
      },
    ],
    decision: () => ({ action: "expose shared primitives as MCP tools behind a review gate", owner: "Codex" }),
  },
];

function opener(c: Ctx): string {
  if (c.offline > c.ready)
    return pick([
      `All-hands. We're only ${c.ready}/${c.total} actually live — let's fix what we can reach, then steer.`,
      `Quick all-hands. Most of the roster's dark (${c.ready}/${c.total} up). I'll keep this tight and we triage the rest.`,
    ]);
  if (staleVault(c))
    return `All-hands — ${c.ready}/${c.total} live, but the vault's gone quiet (last touch ${c.lastActivity ? relTime(c.lastActivity) : "never"}). That's our first thread.`;
  return pick([
    `All-hands. ${c.ready}/${c.total} live. Let's keep it to what actually needs us — two or three real items.`,
    `Room's convened — ${c.ready}/${c.total} up. Two or three real items, then we dispatch.`,
  ]);
}

/** A brief, in-character chime-in from an agent that hasn't spoken yet. */
function checkIn(id: string, c: Ctx): string {
  return PERSONAS[id]?.suggestion(c) ?? "";
}

function chairClose(c: Ctx, decisions: { action: string; owner: string }[]): string {
  if (decisions.length === 0)
    return `So we're steady — nothing urgent to fight. I'll note that we held the line and we pick the thread back up next round.`;
  const items = decisions.slice(0, 3).map((d, i) => `(${i + 1}) ${d.action}`).join("; ");
  return `Decision — priorities are ${items}. jcode's got dispatch; I'll write the rationale to Shared Knowledge so next round starts from here.`;
}

function cochairClose(decisions: { action: string; owner: string }[]): string {
  if (decisions.length === 0)
    return `Nothing to fan out — I'll keep shared memory current and flag the moment anything drifts.`;
  const items = decisions.slice(0, 3).map((d, i) => `(${i + 1}) ${d.action} → ${d.owner}`).join("; ");
  return `On it — dispatching in parallel: ${items}. I'll track each thread in the vault and bounce blockers back to the chair.`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Route a user message to the most relevant agents and generate replies.
 *  Async + live-LLM: each chosen agent replies through cascadeChat, falling
 *  back to its templated `respond` line if the provider call fails. */
export async function replyToMessage(report: SystemReport, message: string): Promise<MeetingTurn[]> {
  const c = deriveCtx(report);
  __tid = Date.now() % 100000;
  const lower = message.toLowerCase();

  // The two co-chairs (Claude, jcode) run the room; specialists are matched from the rest.
  const scored = ORDER.filter((id) => id !== "claude" && id !== "jcode")
    .map((id) => ({
      id,
      score: PERSONAS[id].keywords.reduce((n, k) => (lower.includes(k) ? n + 1 : n), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // Decide which agents speak, in order (same logic as before).
  const ids: string[] =
    scored.length === 0
      ? ["claude", "jcode", ...pickGeneralists(1)]
      : [...scored.slice(0, 3).map((x) => x.id), "jcode", "claude"];

  // Run the reaction round in PARALLEL — every turn is a real model call, but
  // firing them concurrently keeps a live reply fast (~one turn's latency, not
  // the sum of all). Order is preserved by mapping back over `ids`.
  const texts = await Promise.all(
    ids.map(async (id) => {
      try {
        return await withTimeout(
          llmTurn(id, { report, phase: "reply", userMessage: message, priorTurns: [] }),
          TURN_TIMEOUT_MS
        );
      } catch {
        return null;
      }
    })
  );
  const turns: MeetingTurn[] = ids.map((id, i) =>
    // LIVE ONLY: real model reply, or an honest "no response" — never a canned
    // persona line dressed as the agent, and no fabricated delegation/decision.
    turn(id, "reply", texts[i] ?? `— ${meta(id).name}'s model didn't respond via the live gateway —`)
  );

  logEvent({
    source: "background",
    level: "info",
    event: "meeting: reply thread (live)",
    detail: `"${trim(message)}" → ${ids.filter((i) => i !== "claude" && i !== "jcode").map((i) => meta(i).name).join(", ") || "chairs only"}`,
  });
  return turns;
}

function pickGeneralists(n: number): string[] {
  const pool = ["pi", "openclaw", "codex", "antigravity", "opencode", "vibe"];
  return shuffle(pool).slice(0, n);
}
