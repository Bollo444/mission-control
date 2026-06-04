# Changelog

All notable changes to **Mission Control** are recorded here. Entries are grouped
into dated milestones and derived from the project's Git history; the short hash
after each line links to the commit on GitHub.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/).
This project is run local-first and is not published as versioned releases, so
milestones are named by date and theme rather than semantic version numbers.

---

## 2026-06-03 — Public launch & live limits

### Added
- **Static public landing page** (`site/`) in the Mission Control branding, with a
  Caddy / VPS deploy guide (`site/DEPLOY.md`) — auto-HTTPS, no private URLs. `3b841d6`
- **Branding**: README hero banner and app icon in the dark / signal-teal / ◎
  identity, with the nine-color fleet spectrum and a telemetry motif. `7941729`
- **Live per-provider rate limits** — OpenRouter reads `/credits` (≥ $10 purchased
  unlocks 1,000 free req/day, else 50); the gateway captures
  `x-ratelimit-limit-requests` / `-remaining-requests` / `-limit-tokens` from each
  response so providers that report them (e.g. Groq) show real remaining counts.
  Budget gauges now read the effective live-or-static limit and show "used / limit ·
  live · N left". `22f6c9c`
- **Gateway analytics tab** with today / 7d / 30d windows — per-provider volume,
  success rate, latency and tokens (31-day daily history). `d1f361e`
- **Tool-aware routing** (tool-call requests prefer tool-capable models) and
  **streaming token accounting** (TPD now counts streamed responses via injected
  `stream_options.include_usage`). `d1f361e`

### Changed
- **Every agent now defaults to a free model** so a fresh clone runs at zero cost:
  `claude → Cerebras gpt-oss-120b`, `hermes → NVIDIA NIM qwen3-coder-480b`,
  `antigravity → Groq llama-3.3-70b` (the other six were already free). Defaults
  are spread so each free provider lights up at least one agent; saved user choices
  are never overwritten. `d77b011`

### Docs
- Cloud-deployment compatibility map explaining why Vercel / serverless won't fit a
  stateful, terminal-spawning control plane. `a9351a0`
- Brief maintainer "how I run it" note at the top of the README. `7ac9eae`
- Quick start now uses the real clone URL. `311454c`

---

## 2026-06-02 → 06-03 — Free-LLM gateway & resilience

### Added
- **Fleet Gateway** (`lib/gateway.ts`, `/api/gateway/[...path]`) — one
  OpenAI-compatible endpoint in front of every configured free provider (Cerebras,
  NVIDIA NIM, Groq, Cloudflare Workers AI, Mistral, GitHub Models, OpenRouter,
  OpenCode Zen, Local). Cross-provider cascade on 429/5xx with per-provider
  cooldown, streaming pass-through, token authentication, and per-agent routing via
  an `X-MC-Agent` header (this makes the routing table _live_ for agents pointed at
  the gateway). `28dbbba`
- **Universal Logs tab** (`lib/logbook.ts`, `app/logs`) — an append-only,
  time-ordered JSONL record of everything Mission Control does: server start,
  settings / routing / key changes, health sweeps, failover & recovery, every
  gateway request and cascade, agent activity, and vault edits. Secrets are never
  logged (names only). `28dbbba`
- **Usage ledger** (`lib/usage.ts`, `lib/limits.ts`) — rolling RPM/RPD/TPM/TPD
  counters plus success-rate and latency aggregates per provider; the gateway
  pre-skips providers already over a known limit. `b36fe29`
- **Sticky sessions** — a conversation stays on one model for ~30 min (`X-MC-Session`
  header or auto-derived from the messages) to avoid context drift. `b36fe29`
- **Vision routing** — image requests are routed only to vision-capable free
  models. `b36fe29`
- **Opt-in encryption at rest** (`lib/secretbox.ts`) — when `MC_ENCRYPTION_KEY` is
  set, provider keys are AES-256-GCM encrypted in `settings.json` and decrypted in
  memory; fully non-breaking when unset. `b36fe29`
- **OpenRouter free-model cascade proxy** (`/api/route/openrouter/v1`) — tries the
  requested model then cascades through the free catalog in chunks of three,
  returning the first that isn't throttled. `5407a0a`
- **6-hour health monitor** (`lib/health.ts`, `instrumentation.ts`) — per-provider
  availability probes with auto-failover to a healthy free model and auto-revert
  when the preferred model recovers; 429s treated as transient (never a false
  failover). `ea605a6`
- **Free-provider catalog** — OpenCode Zen, Groq, Cerebras, GitHub Models,
  Cloudflare Workers AI, NVIDIA NIM, plus OpenRouter's full free tier; every model
  id verified against live provider lists. `ea605a6`

### Changed
- Per-agent routing split into **preferred** (your choice) vs **effective** (live),
  so failover can auto-revert to the originally chosen model. `ea605a6`
- **Cross-platform agent launch** — opens a real, visible terminal on macOS
  (Terminal.app) and Linux (first available emulator) as well as Windows; IDE-open
  no longer hardcodes `cmd.exe`. `879453d`
- The **team meeting no longer auto-convenes** on tab load — added a "Convene the
  fleet" start gate. `879453d`

### Docs
- "How it works under the hood" callout — **control plane vs. inference path**: the
  dashboard records intent and monitors health but does not intercept agents' LLM
  calls unless an agent is explicitly pointed at the gateway. `6ddb91a`
- "Platform support — do I qualify?" matrix (Windows / macOS / Linux, x64 or ARM64,
  Node 18.18+). `879453d`

---

## 2026-05-31 — Initial fleet console

### Added
- **Unified local dashboard for nine AI coding agents** (Claude, Hermes, Pi,
  OpenCode, Antigravity, OpenClaw, jcode, Vibe, Kilo): fleet overview, per-agent
  mission control, a browser Antigravity IDE, an interactive system terminal, an
  OpenClaw system-operations console, a team-meeting boardroom, and an Obsidian
  shared-memory vault. Next.js 15 / React 19 / TypeScript / Tailwind v4, no
  database. `59417a9`
- **Free-model providers** (Nous Research, Kilo) and **cross-agent routing** so any
  agent can use any provider's free models, with "free" badges in Settings.
  `e67c8a2`
- **Live overview** — CPU / memory / disk gauges, a fleet-readiness bar and a 24h
  activity sparkline; each agent page gained a scoped terminal ready for prompting.
  `7ad0bef`
- **Memory vault visualizations** (List / Neural / Orbit / Stream) and a
  team-meeting boardroom with distinct per-agent text-to-speech voices. `9adb5c9`

### Changed
- Bound the agents to their **real npm CLIs so all nine resolve ready (9/9)**:
  Hermes (`hermes-agent`), Kilo (`@kilocode/cli`), Pi
  (`@earendil-works/pi-coding-agent`), OpenClaw (`openclaw`). `8333db5`, `e67c8a2`
- **Fixed-viewport layout** with dramatic per-agent route transitions and
  customizable, persisted metric presets. `42b3106`, `9adb5c9`

### Fixed
- IDE line-number / gutter alignment (no soft-wrap, synced scroll) and snappier
  load / animation timings throughout. `f95e3db`

---

_This changelog is maintained alongside the code. To regenerate the source list,
run `git log --pretty=format:"%h %ad %s" --date=short`._
