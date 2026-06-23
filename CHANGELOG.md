# Mission Control — build log & changelog

A detailed record of the project's development: **every commit**, grouped by
working session and shown newest-first. Each short hash links to the commit on
GitHub.

**5 sessions · 23 commits + working-tree overhaul · 2026-05-31 → 2026-06-23**
_Latest revision: 2026-06-23 — added Session 5 (Hermes persistency, gold theming
& the tabbed panel interior). Session 4 has since been committed (`f06dcac`)._

| Session | Date | Commits | When | Theme |
|:--:|---|:--:|---|---|
| 5 | 2026-06-23 (Tue) | this commit | Evening | Hermes persistency, gold theme, fade transitions & tabbed panel interior |
| 4 | 2026-06-23 (Tue) | `f06dcac` | Day | Major overhaul: meeting, Hermes console, automation & theming |
| 3 | 2026-06-03 (Wed) | 11 | Late morning → evening | Gateway phases, branding & public launch |
| 2 | 2026-06-02 (Tue) | 4 | Midday | Providers, health monitor & cascade proxy |
| 1 | 2026-05-31 (Sat) | 7 | Afternoon → evening | Initial fleet console |

---

## Session 5 — 2026-06-23 · Hermes persistency, gold theme, fade transitions & tabbed panel interior

### Persistency — nothing resets, anywhere
Leaving a page and returning used to wipe live state — most painfully a
half-typed Hermes TUI session. Root cause: `RouteTransition` remounts each page
on navigation, disposing terminals. Fixed by making views outlive the remount:
- **`HermesTerminal`** now keeps its xterm instance + SSE stream in a
  module-level registry; navigating away only *detaches* the host node (no
  `dispose`/`close`), so returning shows the exact prior screen, mid-prompt.
- **`FleetTerminal`** (the custom command terminal) lifts its rows/history/input
  into a module-level store keyed by agent, surviving navigation too.
- **Duo flow** chat persists to `localStorage` (`mc.duo.v1`).

### Global Hermes theme
Re-skinned the global chrome from teal/cyan to Hermes gold on warmed oxblood
(`--color-signal` → `#f5b75a`, body glow, selection, sidebar logo, edge drawer).
Each agent's own page keeps its individual accent.

### Route transition — fade + slow color blend
Removed the "blob" sweep (all `mc-sweep-*` / per-agent `mc-enter-*`). Now a fast
content `mc-fade-in` (~200 ms) plus a persistent, heavily-blurred color-wash
layer that blends from the previous accent into the new one over ~900 ms — fast
motion, slow color.

### Edge drawer — slam-to-activate
`EdgeFileDrawer` now opens when the pointer hits the far-right edge
(`clientX ≥ innerWidth − 2`), in addition to the hover hot-zone.

### Hermes panel interior — tabbed surface
`HermesConsole` became a tabbed panel (`components/ide/hermes/`):
- **New Session** (default) — the live TUI, kept mounted (`display:none` on
  switch) so it never resets.
- **Skills & Tools** — a picker toggling *Tool sets* (an `enabled / installed`
  fraction; each toolset's name is its real-time trigger keyword, with a switch
  that writes `config.yaml`) and *Skills* (grouped by the 26 on-disk categories
  with installed counts, each skill toggled via `skills/.usage.json`).
- **Messaging** — stub shell (Telegram/Discord/Slack/…), deferred to last.
- **Artifacts** — Hermes outputs aggregated by type (Snapshots, Shared, Cron
  Outputs, Images, Audio, Memories, Plans, Transcripts) with counts.
- **Right rail** (New Session) keeps Duo flow + Capabilities and adds a
  scrollable **Sessions** list (subagent spawns badged via `parent_session_id`)
  and a **Profiles** panel surfacing the active-profile count — each spawned
  subagent being its own profile/identity/soul.

New data layer `lib/hermes-data.ts` + five routes under `app/api/hermes/`
(`toolsets`, `skills`, `profiles`, `sessions`, `artifacts`), reading the Hermes
home (`%LOCALAPPDATA%/hermes`): `config.yaml` (via `yaml`), the `skills/` tree +
`.usage.json`, `profiles/`, and `state.db` (via `sql.js`). `next.config.mjs`
gained `outputFileTracingRoot` (fixes a Windows EPERM AppData-junction build
crash) and `serverExternalPackages` for `@lydell/node-pty` + `sql.js`.

### Terminal launch flash — fixed
The console flash on Hermes launch was Hermes' `prefetch_update_check()`
(`hermes_cli/banner.py`) spawning `git` without `CREATE_NO_WINDOW`, but only when
its 6 h `.update_check` cache was stale. `lib/pty.ts` now refreshes that cache
(`ts` → now, preserving `rev`/`ver`/`behind`) before every Hermes spawn, so the
check always short-circuits and never spawns `git`. A separate cold-start ConPTY
console-allocation flash (Hermes being a console-subsystem binary) can't be
removed without detaching the PTY, which would break the live stream.

---

## Session 4 — 2026-06-23 · Major overhaul: meeting, Hermes console, automation & theming
_Committed as `f06dcac`. Reconstructed from the project's auto-memory and that
session's work._

### Team meeting — fixed init + made it persistent
The boardroom wouldn't start: `GET /api/meeting` ran one live-LLM call per turn
sequentially, each behind a 60s gateway timeout, so the request hung for minutes.
It now returns the templated, metric-grounded meeting **instantly**; live model
upgrades stream from a new `GET /api/meeting/stream` (SSE) and patch each turn in
place. Meeting state now persists across tab switches via `localStorage`
(`mc.meeting.v1`).

### Hermes — dedicated console with a real native TUI
Hermes got its own surface (`components/ide/HermesConsole.tsx`) instead of the
generic agent page, gated by a `skin.hermes` flag:
- **Native TUI embedded** — xterm.js talks to a server-side ConPTY over SSE
  (`lib/pty.ts` + `/api/hermes/pty`); the PTY lives in the Node process, so the
  terminal resumes across tab switches.
- **Duo flow** relay popup — `@mention` an agent (`@openclaw`, `@claude`) and
  Hermes pairs with just that one over ACP (`lib/acp.ts` ↔ `hermes-acp`), as
  opposed to the full Team Meeting. Renamed from "Open relay".
- **Update button** — checks `uv` for a newer Hermes (`/api/hermes/update`).

### System files & automation
- **Right-edge hover drawer** (`components/EdgeFileDrawer.tsx`) lists agent
  configs, the vault, and app settings (`/api/system/files`, reads allow-listed
  to known roots); clicking a file peeks its contents.
- **Automation page** (`/automation`) — cron jobs with an in-process scheduler
  (`lib/cron.ts`, booted from `instrumentation.ts`) and headless sub-agent deploy
  (`lib/subagents.ts`).

### Theming & polish
Hermes shifted oxblood → near-black; gold caduceus signature with a radial
shimmer, plus a sweeping shimmer band across the hero top. The file drawer became
blurred glass with drifting gold motes and a modern slide/scale/fade transition.

### Infra fixes
Hermes was pinned to the now-unavailable `claude-fable-5` (broke the TUI) and was
missing the `agent-client-protocol` dependency (broke duo-flow/ACP). Fixed both,
then repointed Hermes at the **dashboard gateway router** (`provider: custom` →
`http://127.0.0.1:4317/api/gateway/v1`, `model: auto`) so it runs on the fleet's
free providers instead of an Anthropic subscription. Added `@lydell/node-pty` +
`@xterm/xterm`; native module marked external in `next.config.mjs`. Stack runs as
a PM2 production build on win32-arm64.

---

## Session 3 — 2026-06-03 · Gateway phases, branding & public launch
**11 commits · late morning into the evening.** The gateway grew analytics,
budgets and live limits; the project got its branding, docs and a public landing
page, and went live on the web.

### Evening · [`113521e`](https://github.com/Bollo444/mission-control/commit/113521e) — Changelog, first cut
Reconstructed the release history into a Keep-a-Changelog `CHANGELOG.md` and a
branded `site/changelog.html` timeline, linked from the landing nav/footer and
the README. _(Superseded the same session by this detailed build log.)_

### Afternoon · [`3b841d6`](https://github.com/Bollo444/mission-control/commit/3b841d6) — Public landing page + deploy guide
Added a self-contained marketing page (`site/index.html` + `banner.svg`) in the
app's branding with CTAs to the repo, plus `site/DEPLOY.md` for hosting it on a
VPS with Caddy (automatic HTTPS). No private URLs included.

### Afternoon · [`d77b011`](https://github.com/Bollo444/mission-control/commit/d77b011) — Zero-cost defaults (every agent on a free model)
Moved the three remaining paid defaults onto free providers so a fresh clone
runs every agent free, spread so each provider lights up at least one agent:
`claude → Cerebras gpt-oss-120b`, `hermes → NVIDIA NIM qwen3-coder-480b`,
`antigravity → Groq llama-3.3-70b`. Affects only the defaults a new clone starts
from — saved user choices are never overwritten.

### Afternoon · [`22f6c9c`](https://github.com/Bollo444/mission-control/commit/22f6c9c) — Live per-provider rate limits
`lib/livelimits.ts` persists real limits to `~/.mission-control/livelimits.json`.
The health sweep reads OpenRouter `/credits` (≥ $10 purchased unlocks 1,000 free
req/day, else 50); the gateway captures `x-ratelimit-limit-requests` /
`-remaining-requests` / `-limit-tokens` from each response (e.g. Groq) for real
remaining counts. Budget gauges now show "used / limit · live · N left", falling
back to the labeled estimate where a provider doesn't report. Verified OpenRouter
at 1,000/day (from $15 credits) and Groq's headers live.

### Afternoon · [`7ac9eae`](https://github.com/Bollo444/mission-control/commit/7ac9eae) — Docs: maintainer "how I run it" note
Added a brief note at the very top of the README describing how the maintainer
runs it day-to-day — with private URLs and email deliberately kept out.

### Afternoon · [`a9351a0`](https://github.com/Bollo444/mission-control/commit/a9351a0) — Docs: cloud-deployment compatibility map
Added a map explaining why a stateful, terminal-spawning control plane doesn't
fit Vercel / serverless platforms, and what does (an always-on VPS or box).

### Afternoon · [`311454c`](https://github.com/Bollo444/mission-control/commit/311454c) — Docs: real clone URL in Quick start
Replaced the placeholder with the actual `github.com/Bollo444/mission-control`
clone URL.

### Midday · [`7941729`](https://github.com/Bollo444/mission-control/commit/7941729) — Branding: banner, icon & refreshed title
Added `assets/banner.svg` (README hero) and `assets/icon.svg` in the dark /
signal-teal / ◎ identity, with the nine-color fleet spectrum and a telemetry
motif. The README now leads with the banner and the title "Mission Control — AI
agent fleet console + free-LLM gateway."

### Midday · [`d1f361e`](https://github.com/Bollo444/mission-control/commit/d1f361e) — Gateway analytics, tool-aware routing, streaming token capture
Added 31-day per-provider history and `GET /api/analytics?window=today|7d|30d`,
surfaced in a new **Gateway** tab with a window toggle and per-provider bars.
Tool-call requests now prefer tool-capable models. Streaming responses inject
`stream_options.include_usage` and a pass-through scans the SSE tail for
`total_tokens`, so TPD counts streamed output too. _(Same session: the OpenCode
CLI was pointed at the gateway via `~/.config/opencode/opencode.json`, default
model `missioncontrol/auto`.)_

### Midday · [`b36fe29`](https://github.com/Bollo444/mission-control/commit/b36fe29) — Gateway phase 2/3: budgets, sticky sessions, vision, encryption
Usage ledger (`lib/usage.ts` + `lib/limits.ts`): rolling RPM/RPD/TPM/TPD plus
success-rate and latency per provider, with the gateway pre-skipping providers
already over a known limit. **Sticky sessions** keep a conversation on one model
~30 min (`X-MC-Session`). **Vision routing** sends image requests only to
vision-capable models. **Opt-in AES-256-GCM key encryption** at rest
(`lib/secretbox.ts`, `MC_ENCRYPTION_KEY`), fully non-breaking when unset.
Settings gained budget gauges, success/latency, and an encryption-at-rest badge.

### Morning · [`28dbbba`](https://github.com/Bollo444/mission-control/commit/28dbbba) — Fleet Gateway (all-provider cascade) + universal Logs tab
The big one. Built the native gateway (`lib/gateway.ts`,
`app/api/gateway/[...path]`): one OpenAI-compatible endpoint in front of every
free provider, routing by explicit model, `auto`, or the calling agent's
preferred model via an `X-MC-Agent` header — which makes the routing table
**live**. Cross-provider cascade on 429/5xx with per-provider cooldown, streaming
pass-through, `X-MC-Served-By` / `X-MC-Attempts` headers, and token auth (token
surfaced + copyable in Settings). Added the append-only JSONL logbook
(`lib/logbook.ts` → `events.log`) and a live **Logs** tab with source/level
filters, search and clear — secrets never logged (names only).

#### Beyond the commits — operations & launch (2026-06-03)
_Real milestones from this session that live outside Git:_
- Pushed the repository **public** to `github.com/Bollo444/mission-control`.
- Set the GitHub **About** panel — description, topics, and homepage
  (`mc.decouvertquatrieme.online`).
- Verified **all nine agent CLIs are installed** locally (fleet 9/9 ready).
- Pointed the **OpenCode CLI at the Fleet Gateway** to activate live routing.
- Confirmed the **OpenRouter** account is on the **1,000 req/day** free tier
  ($15 lifetime credits).
- **Deployed the landing page** to the Contabo VPS behind Caddy (auto-HTTPS) and
  published it at **https://mc.decouvertquatrieme.online** through the Cloudflare
  tunnel.
- Kept the private dashboard **locked behind Cloudflare Access** (single-account).
- Published the **public changelog** at `/changelog` (clean URL via Caddy
  `try_files`).

---

## Session 2 — 2026-06-02 · Providers, health monitor & cascade proxy
**4 commits · one focused midday session.** The free-provider catalog, the
self-healing health monitor, the OpenRouter cascade proxy, and the docs that
explain what the dashboard does and doesn't touch.

### Midday · [`6ddb91a`](https://github.com/Bollo444/mission-control/commit/6ddb91a) — Docs: control plane vs. inference path
Added a highlighted "How it works under the hood" callout (with a seating-chart /
switchboard analogy) clarifying that Mission Control records intent and monitors
health but does **not** intercept agents' LLM calls — wiring an agent to a model
or the cascade proxy is a machine-local edit to that agent's own config, outside
the repo, with no effect on people who clone it.

### Midday · [`5407a0a`](https://github.com/Bollo444/mission-control/commit/5407a0a) — OpenRouter free-model cascade proxy
Added an OpenAI-compatible proxy at `/api/route/openrouter/v1` that tries the
requested model then cascades through every free model in chunks of three,
returning the first that isn't throttled (OpenRouter's native `models[]` fallback
caps at 3). Reads the key from `~/.mission-control`, streams the upstream through,
and reports cascade depth via the `X-MC-OR-Fallback-Set` header. Verified live: a
throttled `qwen3-coder:free` request was transparently served by the next live
free model.

### Midday · [`879453d`](https://github.com/Bollo444/mission-control/commit/879453d) — Cross-platform launch + explicit meeting start
`lib/launch.ts` now opens a real, visible terminal on macOS (Terminal.app via
AppleScript) and Linux (first available of x-terminal-emulator, gnome-terminal,
konsole, xfce4-terminal, kitty, alacritty, xterm) as well as Windows, falling
back to a detached shell; IDE-open no longer hardcodes `cmd.exe`. The boardroom no
longer auto-convenes on tab load — added a "Convene the fleet" gate. README gained
the Windows/macOS/Linux platform matrix and a pre-install checklist.

### Midday · [`ea605a6`](https://github.com/Bollo444/mission-control/commit/ea605a6) — Free-provider catalog + 6-hour health monitor
Added OpenCode Zen, Groq, Cerebras, GitHub Models, Cloudflare Workers AI, NVIDIA
NIM and OpenRouter's full free tier — every model id verified against live
provider lists. Split per-agent routing into **preferred** (your choice) vs
**effective** (live). Built the health monitor (`lib/health.ts`): per-provider
probes with auto-failover to a healthy free model and auto-revert when the
preferred recovers (429s treated as transient); a boot-time 6h scheduler
(`instrumentation.ts`); `app/api/health`; and Settings status dots, "Check now",
a free-tier limits panel and a failover badge. Shipped a comprehensive README and
`.env.example`.

---

## Session 1 — 2026-05-31 · Initial fleet console
**7 commits · afternoon into the evening.** From an empty repo to a nine-agent
console with a browser IDE, terminals, a boardroom and a memory vault — all nine
agents bound to their real CLIs and resolving ready.

### Evening · [`f95e3db`](https://github.com/Bollo444/mission-control/commit/f95e3db) — IDE gutter fix + snappier timings
Stopped the IDE textarea soft-wrapping (`wrap=off`, `whitespace-pre`) and synced
the gutter scroll so line numbers align 1:1 with code. Tightened animation timings
throughout: entrances 0.5–0.6s → ~0.3–0.38s, route sweeps → ~0.42s, card stagger
40ms → 22ms, overview gauges 700ms → 500ms, CPU sample 140ms → 90ms.

### Evening · [`7ad0bef`](https://github.com/Bollo444/mission-control/commit/7ad0bef) — Color swap, hover glow, live overview & per-agent terminals
Swapped Hermes ↔ OpenCode accents (Hermes amber, OpenCode violet) across the
registry, transitions and vault. Added tasteful accent hover-glow, containment
fixes (overflow-hidden + truncate), and edge-proximity auto-scroll on the agent
list (rAF, cached rect, refs not state). Gave each agent page a scoped
FleetTerminal, and built OverviewMetrics — live CPU/mem/disk gauges, a
fleet-readiness bar and a 24h activity sparkline.

### Evening · [`8333db5`](https://github.com/Bollo444/mission-control/commit/8333db5) — Fleet 9/9: Pi & OpenClaw bound to real CLIs
Installed `@earendil-works/pi-coding-agent` (bin `pi` 0.78.0) and `openclaw@latest`
(bin `openclaw`), wiring each to its real config/paths/tools. Renamed
"Pi · PyAgents" → "Pi" and migrated its vault note. Flagged that the real OpenClaw
is a personal-assistant gateway vs the fleet's system-ops persona. All nine agents
now resolve as ready.

### Evening · [`9adb5c9`](https://github.com/Bollo444/mission-control/commit/9adb5c9) — Robust transitions, memory swarm viz & meeting voices
Made the themed color-sweep overlay fire on every tab switch regardless of async
load. Added the MemorySwarm visualization (Neural / Orbit / Stream expressions +
pop-to-open detail, with a List|Neural|Orbit|Stream toggle on the vault, view
persisted). Gave the boardroom Web Speech TTS with distinct per-agent
voices/accents and word-by-word reveal synced to speech boundaries (Voices
toggle; user messages not read aloud).

### Evening · [`42b3106`](https://github.com/Bollo444/mission-control/commit/42b3106) — UI overhaul: fixed-viewport layout & per-agent motion
Locked the app to the viewport (no document scroll; only inner panels scroll) via
a Screen primitive + fixed Shell with a scrollable agent nav. Added dramatic
per-agent entrance animations replayed on every tab switch (RouteTransition + 9
themed keyframes, reduced-motion aware). AgentMetrics gained a distinct default
preset per agent plus user toggle/reorder, persisted to localStorage.

### Afternoon · [`e67c8a2`](https://github.com/Bollo444/mission-control/commit/e67c8a2) — Real agent CLIs + free-model routing
Installed Hermes via Nous Research `hermes-agent` and switched Kilo from the VS
Code extension to the official `@kilocode/cli`. Added Nous + Kilo to the provider
catalog (free tier), flagged Mistral/OpenRouter/Local as free, and pulled in
OpenRouter's `:free` models. Made routing interchangeable — any agent can use any
provider's free models — with sensible defaults (Hermes→Nous, OpenClaw→Kilo).
Added "free" badges in Settings.

### Afternoon · [`59417a9`](https://github.com/Bollo444/mission-control/commit/59417a9) — Initial commit: Mission Control fleet console
Scaffolded the unified local dashboard for nine AI coding agents (Claude, Hermes,
Pi, OpenCode, Antigravity, OpenClaw, jcode, Vibe, Kilo) on Next.js 15 / React 19 /
TypeScript / Tailwind v4, no database. Shipped the fleet overview, per-agent
control pages, a browser IDE, a real interactive terminal, a system-ops console,
a team-meeting boardroom and an Obsidian shared-memory vault.

---

### Maintaining this log
Going forward, add a new entry per commit (or per session) at the top of the
matching session, newest-first. To list raw commits (date only):

```bash
git log --date=short --pretty=format:'%h | %ad | %s'
```
