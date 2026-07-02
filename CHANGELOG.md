# Mission Control — build log & changelog

A detailed record of the project's development: **every commit**, grouped by
working session and shown newest-first. Each short hash links to the commit on
GitHub.

**11 sessions · 81 commits · 2026-05-31 → 2026-07-01**
_Latest revision: 2026-07-01 — added Session 11: **agent-terminal fixes** — opencode
no longer crash-spams the log (npm-shim resolution), Antigravity gets a real
IDE-integrated CLI terminal (+ a fixed launch path), agent CLIs open in a workspace
dir instead of the home root, and the vibe/opencode model configs are repaired._

| Session | Date | Commits | When | Theme |
|:--:|---|:--:|---|---|
| 11 | 2026-07-01 (Wed) | 3 | Day | Agent-terminal fixes: opencode spawn, Antigravity IDE terminal, workspace cwd |
| 10 | 2026-06-28 (Sun) | — | All day | Vibe dog, Gemini voice, OmniRoute brief, agent updates, key encryption |
| 9 | 2026-06-27 (Sat) | 5 | All day | NL automation driver, living canvas, MCP connector node |
| 8 | 2026-06-26 (Fri) | 2 | All day | Jarvis command orb, jcode swarm cockpit, voice & folder picker |
| 7 | 2026-06-25 (Thu) | 14 | All day | Codex overhaul (kilo→Codex), terminal fixes, automation node builder |
| 6 | 2026-06-24 (Wed) | 14 | All day | Native harnesses, Hermes/Sentinel/Antigravity surfaces, Discord messaging |
| 5 | 2026-06-23 (Tue) | `3b9dc1e` | Evening | Hermes persistency, gold theme, fade transitions & tabbed panel interior |
| 4 | 2026-06-23 (Tue) | `f06dcac` | Day | Major overhaul: meeting, Hermes console, automation & theming |
| 3 | 2026-06-03 (Wed) | 11 | Late morning → evening | Gateway phases, branding & public launch |
| 2 | 2026-06-02 (Tue) | 4 | Midday | Providers, health monitor & cascade proxy |
| 1 | 2026-05-31 (Sat) | 7 | Afternoon → evening | Initial fleet console |

---

## Session 11 — 2026-07-01 · Agent-terminal fixes
Ran down "a few things broken in mission-control" — the embedded agent terminals.
All built and shipped under PM2 on prod 4317.

### opencode terminal no longer crash-spams the log
- `lib/detect.ts` `resolveBinary` tried the bare (extensionless) name before real
  Windows extensions, so it matched npm's Unix shell shim (`…\npm\opencode`) ahead of
  `opencode.cmd`. ConPTY spawned the shim → node-pty async-threw `Cannot create
  process, error code: 193` (bad exe format), uncaught, on every connect. Now tries
  `.exe/.cmd/.bat` first so the `.cmd` gets wrapped through `cmd.exe`. `be45a4d`.

### Antigravity — a real IDE-integrated terminal
- The registry pointed at a stale path (`…\Programs\Antigravity\bin\antigravity.cmd`);
  the IDE is actually installed as **Antigravity IDE** with a VS Code-style CLI at
  `…\Programs\Antigravity IDE\bin\antigravity-ide.cmd`. Fixed `binPaths`/`openCommand`/
  `launch` so "Open in the real IDE" works again.
- New `antigravity-cli` PTY kind — a real shell with `antigravity-ide` on PATH, so the
  dashboard terminal can drive the installed IDE (`antigravity-ide .`, open a vault
  note, extensions, tunnel). The IDE panel's integrated terminal is now **tabbed**:
  *Antigravity CLI* (real PTY) + *Fleet* (the existing `.md`-wired console). `7423428`.

### Agent terminals open in a workspace, not the home root
- Coding CLIs shouldn't run in the home root (they scan the cwd; vibe warns "running in
  home is not recommended"). Agent PTY sessions now open in `MC_WORKSPACE_DIR` (default
  `~/workspace`, created on demand); a bare shell still opens at home. `21720d9`.

### Fleet Gateway — OmniRoute now actually running
- The "Fleet Gateway" showed **offline** because OmniRoute (the third-party primary
  router, github.com/diegosouzapw/OmniRoute) was speced but never installed — only
  the MC-side integration + Backup-Generator failover existed. Installed it
  (`npm i -g omniroute`, Node-based, runs on win-arm64), started it under PM2 as
  **`mc-omniroute`** on `:20128` (`pm2 save`d). MC now reports `{up:true, failover:off}`
  and the page shows **online**. (Gotcha: a leftover orphan from the manual test held
  20128 → PM2 crash-looped on EADDRINUSE; fixed by clearing the port before a clean start.)
- `app/gateway/page.tsx`: the embedded OmniRoute panel can never load — OmniRoute
  sends `X-Frame-Options: DENY` — so the dead iframe is replaced with an **"Open
  OmniRoute dashboard ↗"** link. (OmniRoute's own dashboard login is set via its
  bundled `omniroute-reset-password`.)

### Team Meeting — switched to LIVE (no simulation)
Per a new hard rule (no simulated/fake-live data — recorded in `~/.claude/CLAUDE.md`),
the meeting's interactive path was de-faked:
- **No scripted dialogue.** Removed the fabricated "delegation → owner acks →
  decision" arc and the templated fake "heartbeat" work-lines. Every reply turn is now
  a **real model call** (parallelized — a full reply lands in ~10s instead of ~90s),
  grounded in the real system report; if a model doesn't answer it **says so plainly**
  instead of a canned persona line. Idle is **honestly quiet** — no fake busywork.
- **Click-to-@mention.** Click an agent in the roster, or its avatar/name in the
  transcript, to drop `@handle` in the box — reply to one agent directly, in public.
- **No scroll-jacking.** New messages don't yank you to the bottom; if you've scrolled
  up, an unread pill ("↓ N new") appears — click to jump. Auto-scroll only when already
  at the bottom.
- **Roster status lights**: red = offline · pulsing yellow = working now · green =
  idle/standby. **Your icon glows** so you can find yourself. Redundant CPU/core/session
  restatements stripped from the dialogue (already in the metrics header).
- **Convene is fully live too.** The opening round no longer flashes templated text:
  turns seed with blank "responding live…" placeholders and fill from real model
  calls streamed via `/api/meeting/stream` (`streamMeeting` now emits every turn's
  real text, or an honest "no response").
- **Real execution (v1).** `@agent <task>` in the box dispatches an **actual
  subagent CLI run** (`deploySubagent`) — not a discussion turn — and streams the
  agent's **real output** into the transcript, with the roster light going yellow
  while the process genuinely runs. Fixed `.cmd` arg handling (route through
  `cmd.exe /c`, no `shell:true` quote-mangling) and per-agent headless args. Honest
  caveat: it shows **real** results including real failures — most fleet CLIs don't
  yet have a working headless mode here (claude → 401 auth; opencode → TUI-only), so
  useful output needs each agent's headless auth/mode sorted. No fake success.

### Background log (troubleshooting)
- New **`background`** log source in the Logs tab (filterable, gold): fleet background
  work writes there so you can see what's happening and why it stops. Subagent lifecycle
  logs **started / finished / timed-out (5 min) / spawn-error** with duration + exit
  code (the 5-min timeout previously logged nothing). The meeting logs each **live reply
  thread** dispatched (with participants).

### Sessions — "active", not a lifetime file count
- The fleet **"sessions" metric was misleading** — it counted every historical
  session file as if it were an active session (186, incl. Claude Code's whole
  `.jsonl` history), which read as phantom operational overhead. Now `countSessions`
  counts only sessions **touched in the last 24h** (active); old logs stay on disk
  as browsable history/memory. Result: **186 → 12** (12 = today's real Claude Code
  activity).
- Fixed two mis-counts: **OpenClaw** (`~/.openclaw/workspace` is a git workspace)
  and **Antigravity** (`~/.antigravitycli` is a symlink to Gemini config) — both set
  to `sessionFormat: "none"` so they no longer count/list as chat sessions. Files
  untouched.
- Archived the genuinely-disposable session history (jcode/vibe/codex, 167 files)
  to `~/.mission-control/archived-sessions/2026-07-01/` for later summarization —
  reversible, nothing deleted.

### Embedded terminal — copy/paste
- The xterm terminal (`NativeTerminal`) forwarded **Ctrl+C straight to the PTY as
  SIGINT**, so it killed the session instead of copying. Added a key handler:
  Ctrl+C copies the selection when there is one (else it still interrupts), Ctrl+V
  pastes, and Ctrl+Shift+C/V always copy/paste. Covers every embedded terminal
  (Hermes, opencode, codex, jcode, …) since they all render `NativeTerminal`.

### Agent config repairs (user dotfiles, outside this repo)
- **vibe** wouldn't start — `active_model` was a Mistral model, but the Mistral key
  401s so vibe dropped it ("model not found in configuration"). Repointed to
  `minimaxai/minimax-m3` (NVIDIA, valid key); the TUI launches.
- **opencode** — its interactive TUI crashes at raw-mode init in the embedded
  ConPTY (both 1.17.11 and 1.17.4 — upstream). Rather than launch the dead TUI, the
  opencode terminal is now a **real shell** with opencode on PATH (new `SHELL_MODE`
  map in `lib/pty.ts`; the page reads "Terminal · OpenCode" with an
  `opencode run "…"` hint), so it's usable via opencode's non-interactive commands.
  Model set to `opencode/deepseek-v4-flash-free` (opencode-zen's free backend can be
  flaky; `opencode auth login` or a gateway model is the fallback).

---

## Session 10 — 2026-06-28 · Vibe the dog, a real Jarvis voice & the OmniRoute plan
Built largely by **parallel subagents**. Vibe's mascot becomes an actual dog, Jarvis
gets a natural neural voice (Gemini), the fleet's CLIs are updated, provider keys are
now **encrypted at rest**, and the OmniRoute "Fleet Gateway / Backup Generator" plan
is captured for handoff.

### Vibe — now a dog
- `components/ide/VibeDog.tsx` reworked from a cat to a **dog**: floppy droopy ear,
  rounded muzzle + nose, and a gently wagging tail (new `mc-wag` keyframe in
  `globals.css`). Same size/position/rose accent.

### Jarvis voice — Google Gemini (natural), with fallbacks
- `app/api/jarvis/tts/route.ts` now tries **Gemini TTS** (`gemini-2.5-flash-preview-tts`,
  voice "Charon") first — wrapping its raw 24kHz PCM in a WAV header — then falls back to
  **Cloudflare MeloTTS**, then the browser voice. Needs a free `GEMINI_API_KEY` (Google
  AI Studio); dormant until the key is added.

### Keys encrypted at rest
- Enabled `MC_ENCRYPTION_KEY` (in gitignored `.env.local`); all provider keys in
  `~/.mission-control/settings.json` re-saved as AES-256-GCM `enc:v1:…` ciphertext
  (`lib/secretbox.ts`). Verified the app still decrypts + makes live calls.

### Fleet updates
- Updated pi, opencode, openclaw, codex (npm). Hermes upgrade deferred — `uv` couldn't
  rebuild a native dep (`pywinpty`) without a Rust toolchain; existing Hermes untouched.

### OmniRoute — plan captured
- `docs/JULES-BRIEF-omniroute.md`: make OmniRoute the primary **Fleet Gateway** with the
  existing cascade as a health-based **Backup Generator** — phased, ready for Jules.

---

## Session 9 — 2026-06-27 · Natural-language automation driver, living canvas & the MCP connector plan
**2 commits.** Automation gets a plain-language **driver** (an agent builds the flow
for you), the canvas comes **alive**, and there's a build brief to turn the whole
thing into a **Sim.ai-style connector hub with a single MCP node**.

### Natural-language flow driver
- [`c5ef520`](https://github.com/Bollo444/mission-control/commit/c5ef520) — New
  `/api/flows/generate`: describe an automation in plain English and an agent —
  **you pick which one drives** (Claude, Hermes, Codex, jcode…) — emits the node
  graph through the Fleet Gateway. The route **sanitizes** it (valid node types
  only, a guaranteed trigger, edges checked/remapped) and the builder drops it
  onto the canvas to **review, tweak, then Save / Run** — nothing runs on its own.
  Verified: *"summarize today's git commits, and if it mentions a bug, log a
  warning"* → trigger → agent → `if contains "bug"` → log, wired correctly.

### Living canvas
- Nodes gently **float** in place (`mc-node-float`, each with its own phase) and
  connected edges read like **current is flowing through them** — marching glow +
  flicker in teal, brightening on hover/select (`mc-edge-flow`, scoped `.mc-flow`).
  Both respect `prefers-reduced-motion`.

### MCP connector hub — speced, then shipped
- Added `docs/JULES-BRIEF-mcp-connectors.md`: a complete spec to add **one
  `action.mcp` node** that calls tools on any connected **MCP server** — turning
  the builder into a Sim.ai-style connector library (GitHub, Notion, Supabase,
  web search, filesystem, …) **without** adopting Sim's platform (no Postgres/
  Redis/auth). Stays local-first; OAuth connectors (Gmail/Google) deferred to a
  future credential vault.
- [`ceeda60`](https://github.com/Bollo444/mission-control/commit/ceeda60) /
  [`#1`](https://github.com/Bollo444/mission-control/pull/1) — **shipped** by an
  autonomous agent (Google Jules) from that brief: `lib/mcp.ts` (MCP client over
  `@modelcontextprotocol/sdk`, stdio + http, cached clients, reconnect-once),
  `app/api/mcp` + `/test` routes (secrets redacted), the `action.mcp` execution
  in `lib/flows.ts`, the FlowBuilder node (dynamic server/tool selects + schema
  hints), a **Connectors (MCP)** tab to add/enable/remove servers, and a seeded
  `~/.mission-control/mcp.json` (servers default **off**). Pulled to `main`,
  `npm install` + build + tsc verified clean.

---

## Session 8 — 2026-06-26 · Jarvis command orb, jcode swarm cockpit, voice & folder picker
**2 commits.** The home page becomes a living **command orb** you can talk to —
and it talks back. jcode gets a weightless **swarm cockpit**, and launching an
agent gets a pop-out **folder picker**.

### Jarvis command center (`/`)
- [`4057426`](https://github.com/Bollo444/mission-control/commit/4057426) — New
  **OracleOrb** home: a breathing reactor core wrapped in Hermes' caduceus, with
  one orbiting spark per fleet agent. A **talk-to-Jarvis** bar streams Hermes'
  reply over the ACP bridge and **speaks it aloud** — neural TTS via **Cloudflare
  Workers AI MeloTTS** (`/api/jarvis/tts`), a **voice picker** (the model voice +
  every browser voice, choice remembered), and browser **SpeechSynthesis** as the
  always-on fallback; the orb's core quickens while it speaks. Pressing **`/`**
  summons a Mass-Effect edge HUD (`CommandHud`) — Hermes / the fleet (colour-coded
  per agent) / knowledge / ops — each petal opening a real feature in place over
  the dimmed orb. The classic dashboard is preserved at **`/overview`** (the
  sidebar splits into **Command** and **Overview**).

### jcode swarm cockpit
- jcode's page (`JcodeConsole`, `skin.swarm`) is a weightless teal void —
  Crash-jetpack energy — with hex shards, crates and swarm sparks drifting in
  zero-G (`mc-weightless`), a **see-through** native terminal hovering in the
  centre, and floating menu tabs (Swarm · Memory · MCP · Sessions · Launch).
  `NativeTerminal` gains an opt-in **transparent** mode (Hermes/Codex unchanged).

### Launch-anywhere folder picker
- The Launch control pops out a portalled **folder browser** (`DirPicker` over
  `/api/workspace`, sandboxed to your home directory) so you choose the project
  directory to start an agent in — wired into the shared `LaunchControls`, so
  **every agent** gets it.

---

## Session 7 — 2026-06-25 · Codex overhaul, terminal fixes & the automation node builder
**14 commits.** Replaced the dead kilo slot with OpenAI **Codex** — gateway-aligned
for free model fallback, with a noir console and full agentic tool-calling — plus a
batch of terminal fixes, session conversations, a Hermes Profiles tab, and a
ComfyUI-style automation builder.

### Codex — replaces kilo, runs free, codes autonomously
- [`1ffd24b`](https://github.com/Bollo444/mission-control/commit/1ffd24b) — Swapped the kilo agent slot for **Codex** (identity, `skin.codex`, meeting persona, default route; the kilo *provider* is kept). Added a noir **"cipher" console**: a performant hex cipher-rain hero and chapter tabs wired to the real `codex` CLI — Session (native TUI), Plugins (apps library), MCP, Sessions, Prompts, Review, Cloud. A one-click "align to gateway" writes `~/.codex/{config.toml,.env,AGENTS.md}` + a vault note.
- [`cd8f6bf`](https://github.com/Bollo444/mission-control/commit/cd8f6bf) — **OpenAI Responses API adapter** (`lib/responses-bridge.ts`). Codex's CLI now requires `wire_api="responses"`, which the chat-completions gateway didn't speak; the new `/responses` endpoint translates to chat, cascades the free providers, and emits a synthetic Responses SSE stream. The gateway now speaks **three** formats (OpenAI chat + Anthropic messages + OpenAI Responses).
- [`06873a3`](https://github.com/Bollo444/mission-control/commit/06873a3) — **Agentic tool-calling.** Carry prior `function_call` items through the bridge so the loop history stays intact (it was degrading the model into text-format calls); plus a fallback parser for `<function>…</function>` text calls. Verified: `codex exec "create a file…"` runs the full loop — native `shell_command` → Codex executes → file created — on the free fleet.
- [`5a1df53`](https://github.com/Bollo444/mission-control/commit/5a1df53) — Codex gets a real **team responsibility** in the boardroom: it leads a "tooling" topic and owns the **review gate** (shared MCP tools + sandbox/diff-review before anything ships).
- Design + plan: [`2115c79`](https://github.com/Bollo444/mission-control/commit/2115c79) · [`1e0eb63`](https://github.com/Bollo444/mission-control/commit/1e0eb63) (brainstorm → spec → plan → build).

### Terminal fixes
- [`3118aa8`](https://github.com/Bollo444/mission-control/commit/3118aa8) — `.cmd`/`.bat` agent shims (kilo, openclaw, pi, sentinel) threw `spawn EINVAL` in the embedded terminal; now run through `cmd.exe`.
- [`c84a237`](https://github.com/Bollo444/mission-control/commit/c84a237) — opencode's terminal never appeared (its npm shim resolved to the bare, unspawnable name); `resolveCommand` now uses `resolveBinary` (PATHEXT) to find `opencode.cmd`.
- [`3263cf1`](https://github.com/Bollo444/mission-control/commit/3263cf1) · [`bb3757c`](https://github.com/Bollo444/mission-control/commit/bb3757c) — explored an xterm re-fit for the Hermes clip/cursor issue; reverted to baseline (it didn't help). _(jcode/vibe model-config and Hermes' subprocess popups are agent-internal, not MC's terminal.)_

### Other surfaces
- [`6206d33`](https://github.com/Bollo444/mission-control/commit/6206d33) — **Session conversations**: click any session (fleet-wide or per-agent) to read its transcript (`readConversation` + `/api/sessions/content`, allow-listed to the agents' session dirs).
- [`f1641b9`](https://github.com/Bollo444/mission-control/commit/f1641b9) — Hermes **Profiles** tab: view + create subagent profiles (writes `profile.yaml`/`config.yaml`/`SOUL.md`).
- [`6840597`](https://github.com/Bollo444/mission-control/commit/6840597) — **Automation flow builder**: a ComfyUI-style node canvas (React Flow) — trigger / if-then / action nodes wired into chains, saved and run by a graph executor reusing the gateway, shell, Discord and log primitives.
- [`0e1697a`](https://github.com/Bollo444/mission-control/commit/0e1697a) — Team-meeting **Finish** button (logs convene + adjourn) and **date + 24h military** timestamps in the Logs tab.

---

## Session 6 — 2026-06-24 · Native harnesses, agent surfaces, dual-format gateway & Discord
**14 commits.** Every agent now embeds its own real CLI harness in-browser; the
Hermes console became interactive; Sentinel gained a parallel security swarm;
Antigravity got real file-system powers; the gateway's Anthropic compatibility
was verified end-to-end; and the Messaging stub became a real Discord fleet bot.

### Native CLI harness for every agent
- [`80da818`](https://github.com/Bollo444/mission-control/commit/80da818) — Generalized the Hermes ConPTY/xterm pattern to **all** registered agents. `resolveCommand` (in `lib/pty.ts`) now resolves any agent's binary from the registry, and `HermesTerminal` became a reusable `NativeTerminal` (accent prop). Each agent page spawns the agent's **own CLI**, so its recognizable banner renders on load — replacing the external-popup `FleetTerminal`. OpenClaw's console got the same real TUI ([`eaebdec`](https://github.com/Bollo444/mission-control/commit/eaebdec)).
- [`f005368`](https://github.com/Bollo444/mission-control/commit/f005368) — Fixed the embedded xterm stretching the page (a `1fr` grid track with content-based min-width let the terminal blow out the layout). `minmax(0,1fr)` + `min-w-0` + `overflow-hidden`. Also stopped the wandering mascots from re-rendering React 60×/s (now direct DOM writes in the rAF loop).
- [`b0aa5e8`](https://github.com/Bollo444/mission-control/commit/b0aa5e8) — First-run robustness: an uninstalled agent shows an install hint instead of firing a failing PTY for a missing binary.

### Hermes console — made interactive
- [`608b215`](https://github.com/Bollo444/mission-control/commit/608b215) — **Sessions are clickable**: open any session's full transcript in a modal (new `getSessionMessages` reads `state.db`; `GET /api/hermes/sessions/[id]`).
- [`3e22645`](https://github.com/Bollo444/mission-control/commit/3e22645) — **Artifacts are clickable**: preview images/audio/text inline or download (new `GET /api/hermes/artifact`, hard-confined to the Hermes home).

### Per-agent character
- [`6c81cad`](https://github.com/Bollo444/mission-control/commit/6c81cad) — A **marketplace** button by each agent's ready emblem (verified URLs for Claude, OpenCode, Antigravity, Kilo).
- [`c90c993`](https://github.com/Bollo444/mission-control/commit/c90c993) · [`db69cc1`](https://github.com/Bollo444/mission-control/commit/db69cc1) — Whimsy: Claude's ✻ logos **wander the hero** (occasionally cooking or in a fishbowl space helmet); Vibe gets a **wandering dog**. Shared `WanderMascots` engine, reduced-motion aware.

### Sentinel — parallel security hat swarm
- [`91027a2`](https://github.com/Bollo444/mission-control/commit/91027a2) — A **hat swarm**: pick an objective + which hats (red/blue/purple/green/white/yellow) and run them in parallel. Fixed two infra bugs found en route: `.cmd`/`.bat` agents threw `spawn EINVAL` (now shell-spawned — also unblocks headless pi/openclaw/kilo), and the interactive launcher needed stdin, not `-p`.
- [`6890a45`](https://github.com/Bollo444/mission-control/commit/6890a45) — Since `sentinel.py` is interactive (mandatory per-command approval, crashes headless), the hats run through the **free gateway** instead (`deployGatewayRun` → `cascadeChat`). Verified: red + blue hats return distinct ~2.9k-char assessments with CWE/ATT&CK references.

### Antigravity — file-system powers
- [`23b1c41`](https://github.com/Bollo444/mission-control/commit/23b1c41) — A **Workspace** panel in the IDE activity bar that browses real project folders and edits files in a modal (`/api/workspace`: list/read/write, **hard-confined to the user's home** — escape attempts → 403).

### Dual-format gateway — verified
- The Anthropic-compatible endpoint (`/api/anthropic/v1/messages`, `lib/anthropic-bridge.ts`) was **verified end-to-end**: an Anthropic-format request is answered by a free provider in Anthropic shape, bad tokens → 401, `GET /v1/models` lists 72 models. So any Claude-API tool can run free through the fleet.
- [`6f3b9f7`](https://github.com/Bollo444/mission-control/commit/6f3b9f7) — Typed `openAIToAnthropic`'s return (`AnthropicMessage`); the project is now `tsc --noEmit` clean (was 18 errors), bridge tests pass 27/27.

### Discord fleet bot
- [`14825e5`](https://github.com/Bollo444/mission-control/commit/14825e5) — Replaced the Messaging stub with **one Discord bot handed off to all agents**. A channel command like `claude: <task>` routes to that agent through the free gateway and replies as an embed in the agent's **accent color**; `help` lists the fleet. Dormant by default (`lib/discord.ts`, booted from `instrumentation.ts`, self-guards with no token); config + live status + per-agent test in the Messaging tab. Token stored encrypted in `apiKeys`.

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
