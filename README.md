# Mission Control — Agent Fleet Console

A single local web dashboard that unifies **nine AI coding agents** running on
your machine into one command center — with a live system terminal, a shared
**Obsidian memory vault**, and a **team-meeting boardroom** where the whole fleet
reviews real metrics together.

It reads your agents' actual on-disk configs, detects which are installed,
aggregates their sessions, routes models, and launches them — all from one
dark, dense, telemetry-driven control plane. No database, no cloud service:
everything is your local filesystem and processes.

> **Built for Windows** (the embedded IDE/console use Windows window chrome and
> `Ctrl`-based shortcuts), but the app itself runs anywhere Node + Next.js do.

---

## The fleet

Nine agents, each with its own identity (a bespoke animated background + mascot)
and a role it genuinely excels at. Three have a special remit:

| Agent | Kind | Role | Notes |
|------|------|------|-------|
| **Claude Code** | CLI | **Chair** — synthesis & decision | Orchestration brain; runs the meeting |
| **jcode** | CLI | **Co-chair** — delegation & parallel execution | Splits the chair: assigns owners, parallelizes; also owns shared memory/context |
| **OpenClaw** | CLI | **Designated system ops** — direct PC alteration + code health | Its own scarlet **System Operations Console** |
| Hermes | CLI | Autonomous runs & scheduling | Background, unattended task runs |
| Pi · PyAgents | Framework | Data, analysis & instrumentation | The fleet's measurement layer |
| OpenCode | CLI | Provider-agnostic routing & cost | Cheapest-viable model routing |
| Antigravity | IDE | Developer surface | Renders a full **integrated IDE** in the browser |
| Vibe | CLI | Voice, local models & accessibility | Hands-free, private operation |
| Kilo Code | Framework | Config, structure & conventions | Reproducibility & standards |

Agents are **pluggable**: each shows as `ready`, `config`, or `offline` based on
whether its binary resolves on `PATH` (or a configured path) and whether its
config exists. Ones you don't have installed appear as provisionable personas.

---

## Features

- **Fleet overview** — a live status grid: which agents are installed, versions,
  session counts, configs, and last-active times.
- **Per-agent Mission Control** — a dedicated page per agent with its
  tools/capabilities, live on-disk config, recent sessions, routed model, an
  editable memory note, and one-click **Launch / Open IDE / Install**.
- **Antigravity IDE** — a browser-rendered VS Code-style workspace: multi-file
  tabs, a vault explorer with search, an agent manager, source-control view of
  vault activity, a `Ctrl+K` command palette, `Ctrl+S` save, and a live status bar.
- **Live system terminal** — the IDE's integrated terminal runs a **real system
  check** on open (CPU / memory / disk / uptime / fleet, each in its status
  color) and accepts a safe built-in command set wired to the live APIs
  (`status`, `fleet`, `agent <id>`, `launch <id>`, `vault`, `meeting`, …).
- **OpenClaw System Operations Console** — OpenClaw's own scarlet console with
  live machine-health metrics and `sysops` terminal commands for **direct PC
  alteration** (temp/disk assessment, app lifecycle, resource tuning). Destructive
  actions are **proposed as commands for you to run**, never auto-executed (see
  [Security](#security-model)).
- **Team meeting boardroom** (`/meeting`) — all nine agents convene around the
  live metrics. Roll call → status → concerns → suggestions → open questions →
  a ranked closing decision, revealed turn-by-turn. The **chair (Claude)**
  synthesizes; the **co-chair (jcode)** dispatches owners in parallel. Speak to
  the room and it routes your message to the most relevant specialists. Every
  line is generated from real fleet state — no cloud model in the loop.
- **Obsidian shared-memory vault** — a real Obsidian vault: one note per agent
  (each tuned to what that agent excels at), a live shared **Activity Log**, and
  a **Shared Knowledge** base. Launches/installs append to the feed; editing a
  note writes straight to the vault.
- **Settings & model routing** — route each agent to a provider + model and
  manage provider API keys from one place.

---

## Requirements

- **Node.js 18.18+** (20+ recommended; disk metrics use `fs.statfsSync`, Node 18.15+).
- A modern browser.
- Optional: the agent CLIs you want to control (Claude Code, Antigravity, etc.).
  Anything not installed simply shows as provisionable.

## Quick start

```bash
git clone <your-fork-url> mission-control
cd mission-control
npm install
npm run dev          # http://localhost:4317
```

Production:

```bash
npm run build
npm run start        # http://localhost:4317
```

On first run it creates the shared-memory vault (see below) and detects your
agents automatically.

> **Run it on loopback only.** The dashboard reads local configs and spawns local
> CLIs, so it must not be exposed to an untrusted network. See [Security](#security-model).

## Configuration

All optional — copy `.env.example` to `.env` to override:

| Variable | Default | Purpose |
|---|---|---|
| `MC_VAULT_DIR` | `$HOME/MissionControlVault` | Point the shared vault at a custom (e.g. existing Obsidian) folder |

- **Port** is `4317` (change in `package.json` scripts).
- **Provider API keys** are set in the **Settings** page and persisted to
  `~/.mission-control/settings.json` — **outside the repo**, never committed.

### Adding or activating an agent

Agents are defined in [`lib/registry.ts`](lib/registry.ts). To wire a real tool,
point its `bin` / `binPaths` / `install` at the actual binary; the rest of the
dashboard (status, sessions, memory, routing, meeting persona) lights up
automatically once it's detected. Give it a bespoke look by adding a background +
mascot in [`components/skins/`](components/skins) and a voice in
[`lib/meeting.ts`](lib/meeting.ts).

---

## The shared-memory vault

Default location: `$HOME/MissionControlVault` (override with `MC_VAULT_DIR`).
It lives **outside the repo** and is gitignored — it's your personal memory.

```
MissionControlVault/
  README.md                   index / map note
  Activity/Activity Log.md     shared live feed — every agent appends here
  Memory/Shared Knowledge.md   cross-agent knowledge base
  Agents/<Name>.md             per-agent note (Mission / Excels at / Meeting voice / …)
  .obsidian/                   minimal config so it opens cleanly in Obsidian
```

Open that folder as a vault in Obsidian to browse the agent graph. The
dashboard reads and writes it live — and the meeting reads each agent's
"excels at" so the boardroom and the vault speak with one voice.

---

## Security model

This is a **local control plane with real power** — treat it accordingly:

- **Loopback only.** `/api/launch` spawns local processes and `/api/system`
  reads host telemetry. Never expose the raw port to an untrusted network.
- If you want remote access, put it behind an authenticating proxy
  (e.g. Cloudflare Access, a VPN, or an SSH tunnel) — never a bare public port.
- **Destructive system actions are proposed, not executed.** OpenClaw's console
  assesses the system for real (read-only) but **prints** any destructive command
  (temp cleanup, uninstall, tuning) for you to review and run yourself. The web
  app never deletes files, uninstalls apps, or changes the registry on its own.
- API keys live in `~/.mission-control/`, outside the repository.

---

## Architecture

```
app/
  page.tsx                overview / fleet grid + activity rail
  agents/[id]/page.tsx    per-agent mission control
                          → Antigravity renders the integrated IDE
                          → OpenClaw renders the System Operations Console
  meeting/page.tsx        team meeting boardroom — all nine agents + you
  sessions/page.tsx       unified session history
  memory/page.tsx         vault: activity feed + shared knowledge editor
  settings/page.tsx       model routing + API keys
  api/                    agents, agents/[id], launch, sessions, memory,
                          settings, system (live host+fleet), meeting (transcript+reply)
lib/
  registry.ts             agent definitions (identity, detection, launch, install)
  detect.ts               binary / version / config detection
  system.ts               live system report (CPU/mem/disk/uptime/vault/fleet)
  meeting.ts              per-agent personas + metric-grounded meeting engine
  sessions.ts             per-format session parsers
  memory.ts               Obsidian vault read/write + activity feed
  settings.ts             routing + key persistence (~/.mission-control)
  launch.ts               spawns CLIs / opens IDE / runs installs in a terminal
  format.ts, types.ts, paths.ts, useFetch.ts
components/
  Shell, AgentCard, ActivityFeed, ConfigViewer, MemoryEditor, …
  ide/                    AntigravityIde, OpenClawConsole, FleetTerminal, WindowControls
  skins/                  one bespoke animated background + mascot per agent
```

**Data flow:** pages fetch the `/api/*` routes → routes read your local
filesystem, configs, and processes (`lib/*`) → the shared vault is the single
source of truth that every surface (overview, IDE, meeting) reads and writes.

---

## Deployment (optional)

For an always-on personal instance, a common pattern is a process manager plus a
tunnel that fronts it with authentication:

```bash
npm run build
pm2 start "npm run start" --name mission-control
# optional: expose privately behind an authenticating tunnel (e.g. Cloudflare Access)
```

Keep the [security model](#security-model) in mind — the launch endpoint is
powerful, so any remote exposure must be authenticated.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
zero runtime dependencies beyond `next` and a TOML parser. No database.

## License

[MIT](LICENSE) — update the copyright holder to your name before publishing.
