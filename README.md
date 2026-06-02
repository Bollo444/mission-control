# Mission Control — Agent Fleet Console

A single local web dashboard that unifies **nine AI coding agents** running on
your machine into one command center — with a live system terminal, a shared
**Obsidian memory vault**, a **team-meeting boardroom**, a multi-provider
**model-routing** layer, and a self-driving **free-tier health monitor** that
keeps your agents running when a free model or key drops out from under them.

It reads your agents' actual on-disk configs, detects which are installed,
aggregates their sessions, routes models, probes provider availability, and
launches them — all from one dark, dense, telemetry-driven control plane. No
database, no cloud service: everything is your local filesystem, your processes,
and direct calls to the model providers you choose.

> **Built for Windows** (the embedded IDE/console use Windows window chrome and
> `Ctrl`-based shortcuts), but the app itself runs anywhere Node + Next.js do.

---

## Table of contents

- [The fleet](#the-fleet)
- [Features](#features)
- [Requirements](#requirements)
- [Platform support — do I qualify?](#platform-support--do-i-qualify)
- [Quick start](#quick-start)
- [Operating it end-to-end](#operating-it-end-to-end) — start here
- [How it works under the hood — control plane vs. inference path](#how-it-works-under-the-hood--control-plane-vs-inference-path)
- [Model routing & providers](#model-routing--providers)
- [API keys: placement, routing & the recommended setup](#api-keys-placement-routing--the-recommended-setup)
- [Free-tier health monitor (failover & recovery)](#free-tier-health-monitor-failover--recovery)
- [Configuration (environment variables)](#configuration-environment-variables)
- [The shared-memory vault](#the-shared-memory-vault)
- [Local (self-hosted) models](#local-self-hosted-models)
- [Security model](#security-model)
- [.gitignore — what's ignored and why](#gitignore--whats-ignored-and-why)
- [Deployment (always-on)](#deployment-always-on)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [License](#license)

---

## The fleet

Nine agents, each with its own identity (a bespoke animated background + mascot)
and a role it genuinely excels at. **Three carry a special remit that also powers
the health monitor** (see [failover & recovery](#free-tier-health-monitor-failover--recovery)):

| Agent | Kind | Role | Health-monitor duty |
|------|------|------|---------------------|
| **Claude Code** | CLI | **Chair** — synthesis & decision | — |
| **jcode** | CLI | **Co-chair** — delegation & parallel execution | — |
| **OpenClaw** | CLI | Designated system ops — direct PC alteration + code health | — |
| **Hermes** | CLI | Autonomous runs & **scheduling** | **Triggers the sweep every 6h** |
| **Pi · PyAgents** | Framework | Data, analysis & **instrumentation** | **Probes each provider's live models** |
| **OpenCode** | CLI | Provider-agnostic **routing & cost** | **Re-routes agents on failover/recovery** |
| Antigravity | IDE | Developer surface (renders a full in-browser IDE) | — |
| Vibe | CLI | Voice, local models & accessibility | — |
| Kilo Code | Framework | Config, structure & conventions | — |

Agents are **pluggable**: each shows as `ready`, `config`, or `offline` based on
whether its binary resolves on `PATH` (or a configured path) and whether its
config exists. Ones you don't have installed appear as provisionable personas.

---

## Features

- **Fleet overview** — a live status grid: which agents are installed, versions,
  session counts, configs, last-active times.
- **Per-agent Mission Control** — a dedicated page per agent: tools, live on-disk
  config, recent sessions, routed model, an editable memory note, and one-click
  **Launch / Open IDE / Install**.
- **Model routing across 14 providers** — route each agent to a provider + model,
  with a built-in catalog of **free** providers (OpenCode Zen, Groq, Cerebras,
  GitHub Models, Cloudflare Workers AI, NVIDIA NIM, OpenRouter, Mistral, Kilo,
  Nous, Local) plus paid ones (Anthropic, OpenAI, Google).
- **Free-tier health monitor** — every 6 hours the fleet probes each free
  provider, shows a live status dot per provider, and **automatically fails an
  agent over to a healthy free model when its own drops — then reverts when it
  recovers**. See [below](#free-tier-health-monitor-failover--recovery).
- **Free-tier limits panel** — an at-a-glance, approximate "how much can I use
  this for free" reference under the routing table.
- **Antigravity IDE** — a browser-rendered VS Code-style workspace: multi-file
  tabs, a vault explorer with search, an agent manager, a `Ctrl+K` palette, etc.
- **Live system terminal** + **OpenClaw System Operations Console** — real host
  telemetry and a safe, built-in command set. Destructive actions are *proposed*,
  never auto-run.
- **Team-meeting boardroom** (`/meeting`) — all nine agents convene around the
  live metrics; the chair (Claude) synthesizes, the co-chair (jcode) dispatches.
- **Obsidian shared-memory vault** — one note per agent, a live shared Activity
  Log (where the health monitor records every sweep and re-route), and a Shared
  Knowledge base.

---

## Requirements

- **Node.js 18.18+** (20+ recommended; disk metrics use `fs.statfsSync`, Node 18.15+).
- A modern browser.
- Optional: the agent CLIs you want to control. Anything not installed shows as
  provisionable.
- Optional: API keys for whichever model providers you want to use (most have a
  no-credit-card free tier — see the [provider table](#the-provider-catalog)).

---

## Platform support — do I qualify?

The **dashboard core runs anywhere Node 18.18+ runs** — Windows, macOS, or Linux,
on **x64 or ARM64** (this project is developed on a Windows/ARM64 Snapdragon
laptop, so ARM is a first-class target). Everything built for routing and
reliability is OS-agnostic. The **agent control surface** (launching CLIs in a
terminal, the one-click IDE, `winget` installs) is **Windows-first** and degrades
gracefully elsewhere.

### Compatibility matrix

| Capability | Windows | macOS | Linux |
|---|---|---|---|
| Web dashboard, **model routing**, **health monitor / failover**, free-tier panel, providers | ✅ | ✅ | ✅ |
| Shared Obsidian vault, team meeting, sessions, **host telemetry** (CPU/mem/disk) | ✅ | ✅ | ✅ |
| Agent **detection** (installed? which version?) | ✅ | ✅ via `PATH` | ✅ via `PATH` |
| **Launch** a CLI agent in a *visible* terminal | ✅ `cmd` | ✅ `Terminal.app` | ✅ (needs a terminal emulator) |
| One-click **Open IDE** (Antigravity) | ✅ | ✅ \* | ✅ \* |
| One-click **Install** button | ✅ `winget`/`npm` | ✅ `npm` (`winget` = Windows) | ✅ `npm` |
| UI window chrome & `Ctrl` shortcuts | native feel | works (Windows-styled) | works (Windows-styled) |

✅ works · ⚠️ degraded but usable · ❌ Windows-only · \* if the agent's binary path resolves on that OS

Why: detection resolves binaries from your `PATH` (cross-platform), telemetry
handles both `C:\` and `/`, and launching/opening/installing now spawn a real
terminal on each OS (Windows `cmd`, macOS `Terminal.app`, the first available
Linux emulator). The only Windows-specific leftovers are `winget` installs and
the default agent binary paths in [`lib/registry.ts`](lib/registry.ts) — on
macOS/Linux just point those at your real binaries (agents are pluggable).

### Do I qualify? (pre-install checklist)

You can run Mission Control as a **provider-routing + self-healing health-monitor
+ telemetry console** on **any** of these:

- [ ] **OS:** Windows 10/11, macOS, or a modern Linux
- [ ] **CPU:** x64 **or** ARM64 (Apple Silicon, Snapdragon, …)
- [ ] **Node.js 18.18+** (20+ recommended) + a modern browser
- [ ] ~300 MB free for `node_modules` and the build

On **macOS and Linux** the launch / Open-IDE / install buttons open a real
terminal too (Linux needs a terminal emulator installed). The only Windows-only
piece is `winget` installs; everything else — routing, failover, telemetry, the
vault, the meeting — is identical on every platform.

> **Cross-platform launch is built in** (see [`lib/launch.ts`](lib/launch.ts)):
> macOS opens `Terminal.app` via AppleScript; Linux uses the first available
> emulator (`x-terminal-emulator`, `gnome-terminal`, `konsole`, `xfce4-terminal`,
> `kitty`, `alacritty`, `xterm`). Developed on Windows, so the macOS/Linux paths
> follow each platform's standard mechanism — open an issue if your emulator
> isn't covered.

---

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

On first run it creates the shared-memory vault and detects your agents
automatically. The **health monitor starts itself** ~15s after boot and then
every 6 hours (see [below](#free-tier-health-monitor-failover--recovery)).

> **Run it on loopback only.** The dashboard reads local configs, spawns local
> CLIs, and holds your provider keys, so it must not be exposed to an untrusted
> network. See [Security](#security-model).

---

## Operating it end-to-end

The shortest path to a working, self-healing free fleet:

1. **Start it** — `npm run dev` (or build + start), open `http://localhost:4317`.
2. **Add at least one free key** — go to **Settings → Provider API keys**. The
   fastest no-credit-card wins are **Cloudflare Workers AI**, **NVIDIA NIM**,
   **Groq**, and **Cerebras**. Paste a key, click **Save changes**. Keys are
   written to `~/.mission-control/settings.json` (outside the repo) — never to
   git. See [where to get each key](#the-provider-catalog).
3. **Route your agents** — in **Settings → Per-agent model routing**, pick a
   provider + model for each agent. This sets that agent's **preferred** default.
4. **Confirm availability** — scroll to **Free-tier limits & live status** and
   click **Check now**. Each provider you keyed should turn 🟢. (Providers with
   no key show "unconfigured"; that's fine.)
5. **Walk away** — the monitor now runs every 6h. If a free model or key drops,
   the agent on it is re-routed to a healthy free model automatically, and
   reverted when its preferred model returns. Everything is logged to the vault's
   Activity Log.

That's the whole loop. The rest of this README explains each piece.

---

## How it works under the hood — control plane vs. inference path

> [!IMPORTANT]
> **Mission Control is a control plane, not a proxy that sits in front of your
> agents.** The routing table records *your intent* and the health monitor
> manages that record — but your agents (`opencode`, `pi`, Claude Code, …) are
> independent programs that read **their own** configs and call LLM providers
> **directly**. Mission Control never sees or intercepts those API calls.
>
> **When troubleshooting:** if an agent isn't using the model you picked in
> Settings, that's expected — the Settings table is a *plan*, not enforcement.
> The agent uses whatever is in its own config. To make a routing choice (or the
> [cascade proxy](#reliable-free-openrouter-access-cascade-proxy)) actually take
> effect, you point that agent's own config / base-URL at it.

Two mental pictures:

- **Routing table = a seating chart on the wall.** "Pi sits at the OpenRouter
  desk" is a plan everyone can see — but writing a new name on the chart doesn't
  physically move the person. The agent goes wherever *its own config* takes it.
- **Cascade proxy = a smart switchboard.** Dial *through* it and it tries every
  free line until one connects — but only if your phone is set to dial through
  the switchboard. A phone set to call OpenRouter directly bypasses it and gets
  the busy signal (429) itself.

What Mission Control **does**: read your agents' on-disk configs (to show
installed / version / routed model), store your routing intent + API keys (in
`~/.mission-control`, outside the repo), launch agents, run the health monitor,
and expose the opt-in cascade proxy. What it **doesn't do**: rewrite each agent's
private config or man-in-the-middle their provider traffic — by design, so it
stays non-invasive and predictable. Wiring an agent to actually use a model or
the proxy means editing **that agent's own config** (in its home directory,
outside this repo) — a machine-local change that is never committed and never
affects anyone who clones the repo.

---

## Model routing & providers

### Preferred vs. effective routing

Every agent has two routes, both stored in `~/.mission-control/settings.json`:

- **Preferred** (`routingPreferred`) — the model *you* chose in Settings. The
  routing dropdowns edit this. It is never overwritten by the system.
- **Effective** (`routing`) — the model actually in use right now. Normally it
  equals your preferred; it only differs when the health monitor has failed the
  agent over to a backup. When that happens the agent's row shows a **⚠ failover**
  badge, and the agent auto-reverts to preferred once it's healthy again.

Saving a route in the UI sets **both** (an explicit choice clears any failover).

### The provider catalog

Defined in [`lib/settings.ts`](lib/settings.ts) (`PROVIDERS`). **Any agent can be
routed to any provider** — free providers are available to every agent, not just
the one that shipped them.

| Provider | Key (env / Settings) | Free? | Where to get the key |
|---|---|---|---|
| **OpenCode Zen** | `OPENCODE_API_KEY` | ✅ | [opencode.ai/auth](https://opencode.ai/auth) |
| **Groq** | `GROQ_API_KEY` | ✅ no card | [console.groq.com](https://console.groq.com) → API Keys |
| **Cerebras** | `CEREBRAS_API_KEY` | ✅ no card | [cloud.cerebras.ai](https://cloud.cerebras.ai) → API Keys |
| **GitHub Models** | `GITHUB_TOKEN` | ✅ | [github.com/settings/personal-access-tokens](https://github.com/settings/personal-access-tokens) — **Models: read** |
| **Cloudflare Workers AI** | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | ✅ no card | dash → AI → Workers AI → **Use REST API** (use the *Workers AI* token template) |
| **NVIDIA NIM** | `NVIDIA_API_KEY` | ✅ dev tier | [build.nvidia.com](https://build.nvidia.com) (key prefix `nvapi-`) |
| **OpenRouter** | `OPENROUTER_API_KEY` | ✅ (`:free` models) | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **Mistral** | `MISTRAL_API_KEY` | ✅ Experiment tier | [console.mistral.ai](https://console.mistral.ai) (phone-verified) |
| **Kilo** | `KILOCODE_API_KEY` | ✅ | [kilocode.ai](https://kilocode.ai) → dashboard |
| **Nous Research** | `NOUS_API_KEY` | ◐ beta/credits | [portal.nousresearch.com](https://portal.nousresearch.com) |
| **Local** | `LOCAL_API_KEY` / `LOCAL_BASE_URL` | ✅ | self-hosted — see [Local models](#local-self-hosted-models) |
| **Anthropic** | `ANTHROPIC_API_KEY` | 💲 | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | `OPENAI_API_KEY` | 💲 | [platform.openai.com](https://platform.openai.com) |
| **Google** | `GEMINI_API_KEY` | 💲 | [aistudio.google.com](https://aistudio.google.com) |

> Model IDs in the catalog are kept in sync with what each provider actually
> serves. They drift over time — the health monitor flags any catalog ID that no
> longer matches a provider's live list, which is how you'll know to update it.

### "Uncensored" models

Hosted/API models can't have their guardrails removed — that would require
weight access (impossible over an API) or ToS-violating jailbreaking. The
legitimate path is **model selection**: route to a model that is un-aligned *by
design*, e.g. OpenRouter's `cognitivecomputations/dolphin-mistral-24b-venice-edition:free`,
or run a pre-abliterated GGUF locally. No special tooling required.

### Reliable free OpenRouter access (cascade proxy)

OpenRouter's free pool is heavily rate-limited (lots of users hammer it), and
its native multi-model fallback caps at **3** models. Mission Control exposes an
OpenAI-compatible proxy that cascades through **every** OpenRouter free model in
the catalog — in chunks of 3 — and returns the first one that isn't throttled,
so a single request rarely fails:

- **Base URL:** `http://127.0.0.1:4317/api/route/openrouter/v1`
- **Use it:** point any agent/tool's OpenRouter **base URL** at that, then call
  `/chat/completions` as usual. Send a free model in `model` (tried first) or
  omit it. **No key goes in the request** — the proxy uses the
  `OPENROUTER_API_KEY` stored in `~/.mission-control`.
- The response carries an `X-MC-OR-Fallback-Set` header showing how deep the
  cascade went (`0` = the primary set served).

```bash
curl http://127.0.0.1:4317/api/route/openrouter/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen/qwen3-coder:free","messages":[{"role":"user","content":"hi"}]}'
# if qwen is throttled, it's transparently served by the next live free model
```

Implemented in [`app/api/route/openrouter/[...path]/route.ts`](app/api/route/openrouter).

> [!NOTE]
> Pointing an agent at this proxy means editing **that agent's own config** (in
> its home directory, outside this repo). It's machine-local — never committed,
> and it doesn't affect anyone who clones the repo or their copy of that agent.
> One tradeoff: that agent then needs the Mission Control server running
> (`127.0.0.1:4317`) for its OpenRouter calls. See
> [control plane vs. inference path](#how-it-works-under-the-hood--control-plane-vs-inference-path).

---

## API keys: placement, routing & the recommended setup

**Where keys live:** the **only** place Mission Control persists provider keys is

```
~/.mission-control/settings.json      (Windows: C:\Users\<you>\.mission-control\settings.json)
```

This file is **outside the repository** (the repo is `~/mission-control`; the
config dir is `~/.mission-control`), so keys are never anywhere git can see them.
The client/browser is **never** sent raw keys — `publicSettings()` reduces each
key to a `configured: true/false` boolean before it leaves the server.

**Two ways to supply a key** (the server reads `settings.json` first, then falls
back to environment variables — `apiKeys[name] || process.env[name]`):

1. **Settings page (recommended).** Paste the key → **Save**. It persists across
   restarts, lives outside the repo, and never enters your shell history or env.
2. **Environment variable.** Export `GROQ_API_KEY=…` (or put it in a gitignored
   `.env`). Useful for CI/automation or read-only deploys. Note a `.env` file is
   a foot-gun next to the repo; prefer option 1 for anything long-lived.

**Recommended setup:**

- Start with the **no-credit-card free** providers — **Cloudflare Workers AI**,
  **NVIDIA NIM**, **Groq**, **Cerebras** — so the fleet runs for $0 and the
  monitor has healthy failover targets.
- **Scope tokens to least privilege.** For Cloudflare, use a token limited to
  *Workers AI* (the dashboard's "Workers AI" template) — **not** an all-access
  token. If a scoped key leaks, the blast radius is just free inference. The
  app also stores `CLOUDFLARE_ACCOUNT_ID` alongside the token (it's part of the
  endpoint URL, not a secret).
- **Rotate freely.** Mission Control never has access to your provider account —
  it only holds the key string. To rotate: create a new key on the provider's
  site, paste it into Settings (overwrites the old), then delete the old key on
  the provider's site.

**What "routed" means:** Mission Control is a **control plane**. It records which
provider + model each agent should use, stores the shared keys centrally, surfaces
the routing on every agent's page, and — via the health monitor — makes live
calls to each provider to verify availability and rewrite the *effective* route
when needed. It does not itself proxy your agents' inference traffic.

---

## Free-tier health monitor (failover & recovery)

Free models and free keys are volatile: a model gets renamed, a free tier rotates
its catalog, a promo ends, a key hits its cap. This subsystem keeps your fleet
running through all of that, automatically. It's wired to the three agents whose
roles map to the job:

- **Hermes (scheduling)** triggers the sweep — **once ~15s after boot, then every
  6 hours**.
- **Pi (instrumentation)** probes each free provider's live model list.
- **OpenCode (routing & cost)** performs any re-route and logs it.

Every sweep and action is appended to the vault's **Activity Log**, so the
boardroom and your Obsidian graph show exactly what happened and when.

### How probing works

For each **free** provider the monitor calls its model-list endpoint and records
one of four statuses (in [`lib/health.ts`](lib/health.ts)):

| Status | Meaning |
|---|---|
| 🟢 `available` | Endpoint answered; per-model presence is checked against the catalog |
| 🔴 `unavailable` | Endpoint reachable but erroring / down (e.g. HTTP 5xx) |
| ⚪ `unconfigured` | No key set yet — can't check (not a failure) |
| 🟡 `unknown` | No probe wired (Nous), **or rate-limited (HTTP 429)** — never penalized |

Authenticated probes (Cloudflare, Groq, Cerebras, Mistral, NVIDIA NIM, GitHub,
Kilo) need their key; OpenCode Zen and OpenRouter expose a **public** model list
so they're checked even without a key.

### Auto-failover & auto-revert

After probing, for every agent **on a free provider**:

- **Fail over** — if the agent's effective model is *confirmed* bad (its provider
  is down, **or** the provider is up but the model is absent from the live list),
  OpenCode re-routes the agent to the first **confirmed-available** model from a
  priority list of free, coding-capable fallbacks (NVIDIA NIM → Cloudflare → Groq
  → Cerebras → OpenRouter → Mistral → GitHub → OpenCode Zen).
- **Auto-revert** — if the agent was failed over and its **preferred** model is
  healthy again, OpenCode restores it.

Safety rails: the monitor **only acts on confirmed signals**. `unconfigured`,
`unknown`, and rate-limited (429) states never trigger a failover, so a transient
throttle or a missing key can't thrash your routing. Paid-provider agents
(Claude, Antigravity, …) are left untouched.

### State, API & UI

- **State file:** `~/.mission-control/health.json` — per-provider status, per-model
  availability, last-checked time, and a rolling log of the last 40 failover/restore
  actions.
- **API:** `GET /api/health` returns the latest state; `POST /api/health` runs a
  sweep on demand.
- **Scheduler:** started by [`instrumentation.ts`](instrumentation.ts) (Next.js'
  boot hook) — idempotent, Node-runtime only.
- **UI:** **Settings → Free-tier limits & live status** shows a colored dot +
  detail per provider, the last-checked time, and a **Check now** button. Any
  failed-over agent shows a **⚠ failover** badge on its routing row.

Tune the cadence with `MC_HEALTH_INTERVAL_MIN` (see below).

---

## Configuration (environment variables)

All optional — copy `.env.example` to `.env` to override (`.env` is gitignored):

| Variable | Default | Purpose |
|---|---|---|
| `MC_VAULT_DIR` | `$HOME/MissionControlVault` | Point the shared vault at a custom (e.g. existing Obsidian) folder |
| `MC_HEALTH_INTERVAL_MIN` | `360` (6h) | Health-sweep cadence in minutes (floored at 5) |
| `LOCAL_BASE_URL` | `http://127.0.0.1:1234/v1` | OpenAI-compatible base for the **Local** provider (LM Studio/Ollama/vLLM) |
| `<PROVIDER>_API_KEY` | — | Optional fallback for any provider key (prefer the Settings page) |

- **Port** is `4317` (change in `package.json` scripts).
- Provider keys live in `~/.mission-control/settings.json`, **outside the repo**.

---

## The shared-memory vault

Default location: `$HOME/MissionControlVault` (override with `MC_VAULT_DIR`).
It lives **outside the repo** and is gitignored — it's your personal memory.

```
MissionControlVault/
  README.md                    index / map note
  Activity/Activity Log.md      shared live feed — every agent + the health monitor appends here
  Memory/Shared Knowledge.md    cross-agent knowledge base
  Agents/<Name>.md              per-agent note (Mission / Excels at / Memory / Log)
  .obsidian/                    minimal config so it opens cleanly in Obsidian
```

Open that folder as a vault in Obsidian to browse the agent graph.

---

## Local (self-hosted) models

The **Local** provider points at any OpenAI-compatible server via `LOCAL_BASE_URL`
(LM Studio `:1234`, Ollama `:11434/v1`, vLLM, `llama-server`). The health monitor
probes it like any other provider.

- To run an **uncensored local model**, download a **pre-abliterated GGUF** from
  Hugging Face and serve it — no need to abliterate one yourself.
- Sizing rule of thumb on a 16 GB machine: 3B–8B models (Q4) run comfortably,
  ~13–14B is tight, 24B+ generally won't fit. On Apple/ARM/Snapdragon laptops use
  the **native ARM64** build of LM Studio/Ollama; CUDA-only tools (e.g. weight
  abliteration utilities) won't run there.

---

## Security model

This is a **local control plane with real power** — treat it accordingly:

- **Loopback only.** `/api/launch` spawns local processes, `/api/system` reads
  host telemetry, and the app holds your provider keys. Never expose the raw port
  to an untrusted network. For remote access put it behind an authenticating
  proxy (Cloudflare Access, a VPN, or an SSH tunnel) — never a bare public port.
- **Keys at rest** live in `~/.mission-control/settings.json`, outside the repo.
  The browser only ever receives `configured` booleans, never raw keys.
- **Least-privilege tokens.** Prefer narrowly scoped keys (e.g. a Cloudflare
  *Workers AI*-only token). Rotate anything that may have been exposed.
- **Destructive system actions are proposed, not executed.** OpenClaw's console
  prints destructive commands for you to review and run — the web app never
  deletes files, uninstalls apps, or edits the registry on its own.

---

## .gitignore — what's ignored and why

Secrets are protected by **two** layers: they're stored *outside* the repo
(`~/.mission-control`), **and** the in-repo footguns are gitignored. Current
[`.gitignore`](.gitignore):

| Pattern | Why |
|---|---|
| `/node_modules` | Dependencies — reinstalled via `npm install` |
| `/.next/`, `/out/`, `/build` | Next.js build output |
| `*.tsbuildinfo`, `next-env.d.ts` | TypeScript build artifacts |
| `.env`, `.env.*` (keep `!.env.example`) | **Never commit API keys.** If you use the env-var path, keys land here |
| `*.log`, `npm-debug.log*`, … | Logs |
| `.DS_Store`, `Thumbs.db`, `.idea/`, `.vscode/` | OS/editor cruft |
| `/shots/`, `/shots$1.png` | Local screenshots / scratch |
| `/MissionControlVault/` | The personal memory vault, if you point `MC_VAULT_DIR` inside the repo |

Note: `~/.mission-control/` (settings.json + health.json) is **not** listed
because it never lives in the repo to begin with — it's in your home directory.
That's intentional defense-in-depth: even a misconfigured `git add -A` can't
stage your keys.

---

## Deployment (always-on)

For a personal always-on instance, a process manager + an authenticating tunnel:

```bash
npm run build
pm2 start "npm run start" --name mission-control       # serves 127.0.0.1:4317
pm2 save                                                # restart on sign-in/boot
# expose privately behind an authenticating tunnel, e.g. Cloudflare Access:
pm2 start cloudflared --name mc-tunnel -- tunnel --config <path>\tunnel.yml run <tunnel>
```

The health-monitor scheduler runs inside the long-lived `next start` process, so
under PM2 it ticks every 6h with no extra cron. Keep the
[security model](#security-model) in mind — the launch endpoint is powerful, so
any remote exposure must be authenticated.

---

## Architecture

```
app/
  page.tsx                overview / fleet grid + activity rail
  agents/[id]/page.tsx    per-agent mission control (→ Antigravity IDE / OpenClaw console)
  meeting/page.tsx        team meeting boardroom
  sessions/page.tsx       unified session history
  memory/page.tsx         vault: activity feed + shared knowledge editor
  settings/page.tsx       model routing (preferred/effective) + API keys + live health
  api/
    agents, agents/[id], launch, sessions, memory, settings, system, vault, meeting
    health/route.ts       GET last health state · POST run a sweep now
    route/openrouter/…    OpenAI-compatible proxy: cascades free models past 429s
lib/
  registry.ts             agent definitions (identity, detection, launch, install)
  settings.ts             provider catalog, routing (preferred + effective), key persistence
  health.ts               provider probes, auto-failover/revert, scheduler  ← failover engine
  detect / system / meeting / sessions / memory / launch / format / types / paths / voices
instrumentation.ts        Next.js boot hook — starts the 6h health scheduler
components/
  Shell, AgentCard, ActivityFeed, ConfigViewer, MemoryEditor, …
  ide/    AntigravityIde, OpenClawConsole, FleetTerminal, WindowControls
  skins/  one bespoke animated background + mascot per agent
```

**Data flow:** pages fetch `/api/*` → routes read your local filesystem, configs,
and processes (`lib/*`) → the shared vault is the single source of truth every
surface reads/writes. Keys + routing + health state persist in `~/.mission-control`.

---

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
zero runtime dependencies beyond `next` and a TOML parser. No database.

## License

[MIT](LICENSE) — update the copyright holder to your name before publishing.
