# Mission Control — build log & changelog

A detailed record of the project's development: **every commit**, grouped by
working session and shown newest-first. Each short hash links to the commit on
GitHub.

**23 sessions · 2026-05-31 → 2026-08-14**
_Latest revision: 2026-08-14 — added Session 23: __the orb voice agent went live with an intelligent
Gemini 2.0/3.0 routing core (zero-cost complexity/context/cost classifier, sentence-streamed speech,
barge-in, routing badge), Hermes got a native VS Code surface, and the omniroute terminal window was
finally killed by extending the windowsHide preload to `spawn` (57 tests).__ _(Prior: Session 22 — Power Plant / Backup Generator routing with an Anthropic Messages bridge, OmniRoute's
auto-combo re-fueled + 3.8.49, nemotron slot defaults, endpoint sweep.)_

| Session | Date | When | Theme |
|:--:|---|---|---|
| 23 | 2026-08-14 (Fri) | Day | Orb voice agent + intelligent Gemini 2.0/3.0 routing (complexity/context/cost classifier, sentence streaming, barge-in); Hermes native VS Code surface; omniroute window killed (windowsHide preload → spawn) |
| 22 | 2026-08-13 (Thu) | Night | Power Plant/Backup Generator routing + Anthropic bridge; OmniRoute auto-combo re-fueled + 3.8.49; nemotron slot defaults; endpoint sweep (model-drop, slots, bounded read, write mutex) |
| 21 | 2026-08-13 (Thu) | Night | Cline npm pile-up fix: auto-update suppressed on app spawns, registry-first version checks, cross-process one-at-a-time update lock |
| 20 | 2026-08-13 (Thu) | Day | Hermes delegation loop: task store + state machine, two-hop orchestration, scope security, /delegation board, 44 tests green |
| 19 | 2026-08-10 (Mon) | Night | Security-hardening admin boundary reconciled & deployed (MC_ADMIN_TOKEN gate, cron/flows sandbox) |
| 18 | 2026-08-10 (Mon) | Night | Hermes → OmniRoute direct; in-app gateway demoted to cold-standby backup |
| 17 | 2026-08-01 (Sat) | Day | Gemini 3.1 Flash TTS upgrade, healer/learning/repos/mcp-call shipped, README sync, live deploy |
| 16 | 2026-07-30 (Thu) | Day | Fleet restructuring: OpenCode→Cline, ZCode desktop IDE launcher, Kilo cleanup |
| 15 | 2026-07-30 (Thu) | Day | Meeting decisions, flow triggers (cron/meeting), cron flows, Hermes orchestration, OpenCode IDE, MCP call, windowsHide patch |
| 14 | 2026-07-29 (Wed) | Day | Self-healing engine, behavioral learning profile, Health panel |
| 13 | 2026-07-28 (Tue) | Day | Repo workspace, clone UI, agent dispatch, REPO_WORKSPACE_DIR |
| 12 | 2026-07-08 (Wed) | Day | Claude growth-audit hat swarm, separate agentId from Sentinel |
| 11 | 2026-07-01 (Wed) | Day | Agent-terminal fixes: opencode spawn, Antigravity IDE terminal, workspace cwd |
| 10 | 2026-06-28 (Sun) | All day | Vibe dog, Gemini voice, OmniRoute brief, agent updates, key encryption |
| 9 | 2026-06-27 (Sat) | All day | NL automation driver, living canvas, MCP connector node |
| 8 | 2026-06-26 (Fri) | All day | Jarvis command orb, jcode swarm cockpit, voice & folder picker |
| 7 | 2026-06-25 (Thu) | All day | Codex overhaul, terminal fixes, automation node builder |
| 6 | 2026-06-24 (Wed) | All day | Native harnesses, Hermes/Sentinel/Antigravity surfaces, Discord messaging |
| 5 | 2026-06-23 (Tue) | Evening | Hermes persistency, gold theme, fade transitions & tabbed panel interior |
| 4 | 2026-06-23 (Tue) | Day | Major overhaul: meeting, Hermes console, automation & theming |
| 3 | 2026-06-03 (Wed) | Late morning → evening | Gateway phases, branding & public launch |
| 2 | 2026-06-02 (Tue) | Midday | Providers, health monitor & cascade proxy |
| 1 | 2026-05-31 (Sat) | Afternoon → evening | Initial fleet console |

---

## Session 23 — 2026-08-14 · Orb voice agent with intelligent Gemini 2.0/3.0 routing

The orb is no longer just a pretty reactor core — it is now a real-time,
bidirectional voice agent with its own intelligent routing core.

**1. The orb voice agent.** The home-page orb (`components/orb/JarvisVoice.tsx`)
was rewired to a new `/api/orb/turn` streaming endpoint. Replies now arrive as
SSE frames (`route` → `chunk`··· → `done`), are spoken sentence-by-sentence as
they stream, and support **barge-in** — a new command aborts the in-flight turn
and current speech instantly. A live routing badge shows which backend answered
and why.

**2. The intelligent router (`lib/orb/router.ts`).** Every turn is classified
with a zero-cost, deterministic scorer — no extra LLM call, so routing never
adds latency or spend. Three axes:
- **complexity** — message length + a weighted intent lexicon (coding, analysis,
  planning, long-form, system task);
- **context** — conversation history size (token estimate);
- **cost** — fraction of the day's Gemini budget already consumed.

Simple turns go to **Gemini 2.0 Flash**; complex ones (score ≥ 0.55) escalate to
**Gemini 3.0**; near-budget complex turns stay cheap and say why; and agentic
turns (“fix the bug in X”, “restart the bot”) are delegated to **Hermes** via the
existing ACP bridge so it can actually execute them. Model ids are
env-overridable (`ORB_GEMINI_20_MODEL`, `ORB_GEMINI_30_MODEL`) because upstream
retired `gemini-2.0-flash`; without a `GEMINI_API_KEY` the orb stays
Hermes-powered end to end. 12 new router unit tests.

**3. Hermes surfaces + omniroute window fix.** Hermes gained a native VS Code
surface (official `code serve-web` with the vault, fleet agents, git repos,
health and activity feed in the activity bar). And the persistent omniroute
console window is finally gone: `patches/preload-hide-windows.js` now forces
`windowsHide: true` on `spawn`/`spawnSync` too (it only covered the sync exec
variants before, and omniroute's CLI spawns its server asynchronously) — the
patch rides `NODE_OPTIONS`, so it survives reboots.

`tsc` clean, **57/57 tests** green.
---

## Session 22 — 2026-08-13 · Power Plant routing, live nemotron slots, endpoint sweep

Three themes land together:

**1. Power Plant / Backup Generator routing (naming + wire-up).** OmniRoute is
now the **Power Plant** (primary inference router) and the in-app gateway is the
**Backup Generator** (standby cascade). Hermes and Claude Code are re-pointed at
the gateway (`:4317`), which tries the Power Plant first and cascades to the
Backup Generator on any rejection — the "Power Plant first, Backup second"
design. A standalone origin-for-origin proxy (`scripts/power-plant-proxy.mjs`,
PM2 app `mc-power-plant` on `:4318`) embeds OmniRoute's dashboard full-height in
a new sidebar **Power Plant** page (OmniRoute blocks iframes, so path-prefix
proxying couldn't work). The gateway gained an **Anthropic Messages bridge**
(`/v1/messages`) so Claude Code routes through the same path.

**2. Power Plant auto-combo fixed.** OmniRoute's `auto` combo was starved — its
provider pool held only OpenRouter, so its 2-candidate combo exhausted on the
free tier and every "auto" request failed over. `scripts/fuel-power-plant.mjs`
adds the 7 free-provider keys Mission Control already holds into OmniRoute's
store (1 → 8 providers, idempotent), and OmniRoute was updated 3.8.42 → 3.8.49
(the in-app updater failed on `EBUSY` — Windows locks the running server's files).

**3. Slot defaults + endpoint sweep.** NVIDIA retired
`qwen/qwen3-coder-480b-a35b-instruct` (410 Gone); every default pointing at it
now uses the live `nvidia/llama-3.3-nemotron-super-49b-v1.5` (verified 200).
The sweep caught more bugs:
- `lib/anthropic-bridge.ts` dropped `model` in `anthropicToOpenAI`, so every
  Claude call hit the Power Plant model-less and failed over. `model` flows through.
- The gateway `/v1/messages` path never applied the `haiku`/`sonnet`/`opus` slots,
  so `model: "sonnet"` was forwarded verbatim and 400'd. Slots now resolve on the
  gateway path too (matching the legacy `/api/anthropic` bridge).
- `lib/sysfiles.ts` read the whole file before truncating (OOM on a huge log) —
  now a bounded 200 KB read.
- `lib/taskStore.ts` read-modify-write had no lock, so the cron reconcile poller
  racing a user's decide/dispatch could clobber a write and lose a task update —
  added an in-process promise-chain mutex (reads stay lock-free).

`tsc` clean, **45/45 tests** green (incl. a new concurrency regression test),
deployed via `pm2 reload`.

---

## Session 21 — 2026-08-13 · Cline npm pile-up fixed: one update at a time

Diagnosed the "numerous NPM updates" on the server: cline's **built-in auto-updater**
(not the app's healer) fires a detached `npm update -g cline --tag latest
--min-release-age=0` every time the cline CLI launches — even `--version`. Every
app version-check that spawned cline (healer self-update cycle, subagent
dispatch, agent-status page) therefore piled up concurrent npm updates, with no
serialization on cline's side. Root-caused from the running processes and fixed:

### Fix (`lib/healer.ts`, `lib/subagents.ts`, `lib/detect.ts`)
- **`CLINE_NO_AUTO_UPDATE=1`** on every app-spawned agent CLI — healer's checks
  and installs, `deploySubagent`'s spawn, and `detect`'s `--version` probe.
  Honored by cline's binary; harmless for other agents.
- **Registry-first version checks** — `npm ls -g <pkg> --json` instead of
  launching the CLI, so the self-update cycle no longer triggers cline's updater
  at all.
- **Cross-process update lock** (`~/.mission-control/.update.lock`) — only ONE
  npm install runs machine-wide at a time, no matter which trigger (cron, API,
  health-check, manual) fired it; 15-minute stale reclaim, released in `finally`,
  lock-busy logged as `skip` (completed) rather than `failed`.

Killed the 7 stuck updater processes; verified cline intact at 3.0.48. `tsc`
clean, 44/44 tests green, deployed live via `pm2 reload`.

---

## Session 20 — 2026-08-13 · Hermes delegation loop: task store, two-hop orchestration, scope security, /delegation board

Implemented the approved Hermes delegation loop design (`docs/superpowers/specs/2026-08-12-hermes-delegation-loop-design.md`)
— the core "Hermes tasks jcode → jcode accepts → the hub runs it → jcode reports back"
chain — end to end, with real state persisted in `tasks.json` and zero simulated data.

### Task store + state machine (`lib/taskStore.ts`, `lib/DelegationTask.ts`)
- Persistent store at `~/.mission-control/tasks.json` (same dir as `subagents.json`),
  atomic writes (temp-file-then-rename), `updatedAt` bumped on every mutation.
- `createTask` validates required contract fields and auto-generates `tsk_*` ids;
  `transitionTask` enforces the spec's state machine
  (`proposed→running|declined`, `running→done|error`, `declined→proposed`, `error→proposed`)
  and merges real patch fields in the same atomic write; `patchTask` merges error fields
  (accept_error / scope_error) without a state change.
- `MC_TASKS_FILE` env override lets tests run against a temp file — no home-dir pollution.

### Two-hop orchestration (`lib/orchestrator.ts`)
- **Hop 0** `proposeTask` — create the contract in `proposed`.
- **Hop 1** `decideTask` — a REAL acceptance turn against the target's routed model
  (via `cascadeChat`, same routing as the meeting engine): accept → `running` + reason;
  decline → `declined` + reason; LLM failure → stays `proposed` with `accept_error`.
- **Hop 2** `dispatchRun` — launches the real headless run via `deploySubagent`, links the
  `subagents.json` run id into the task; dispatch failure → `error` + `run_error`.
- **Hop 3** `reportBack`/`reconcileRun` — syncs a running task against `subagents.json`
  (crash / `pm2 reload` safe) and summarizes the REAL run output into `report.text`,
  with an honest fallback note when the model returns nothing.

### Scope security (`lib/subagents.ts`)
- `deploySubagent` accepts `scope` + `proposedBy`. A delegation task must explicitly
  declare scope AND be proposed by hermes/user to dispatch; no scope → dispatch denied
  outright (fail-closed) with `denied: true`, which `dispatchRun` routes to `scope_error`
  while keeping the task in place. Non-delegation callers keep the existing write-gate.

### API + UI
- `app/api/orchestrator/` — `GET/POST` list/create, `GET [id]`, `POST [id]/decide`,
  `POST [id]/dispatch`, `POST [id]/reconcile`.
- `components/TaskBoard.tsx` + `app/delegation/page.tsx` — live board polling the API:
  cards by state, create-contract form with declared-scope checkboxes, per-state actions,
  full-JSON detail modal. Sidebar **Delegation** link.

### Tests & validation
- `tests/lib/taskStore.test.ts` (11) + `tests/orchestrator.test.ts` (10) — Vitest, temp-dir
  isolated, mocked LLM/subagents; covers the full accept→dispatch→reconcile→done flow,
  decline, accept_error, dispatch/run failure, and fail-closed scope denial.
- `npx tsc --noEmit` clean · `npx vitest run` 44/44 · `npm run build` green.

---

## Session 17 — 2026-08-01 · Gemini 3.1 Flash TTS upgrade, live site sync with uncommitted modules, docs refresh

The local checkout had drifted far from the live URL (4 commits + 38 files of
uncommitted work behind). This session committed the backlog, upgraded the Jarvis
orb's TTS model to Google's latest, updated the fleet docs to reflect Cline replacing OpenCode + ZCode as a second launcher, and rebuilt/deployed via PM2 so the live tunnel serves current code.

### Gemini 3.1 Flash TTS upgrade
- **`app/api/jarvis/tts/route.ts`** — bumped `GEMINI_MODEL` from
  `gemini-2.5-flash-preview-tts` to `gemini-3.1-flash-tts-preview` (Apr 2026
  release; same 30 prebuilt voices, same 24 kHz PCM → WAV shape, plus audio tags and multi-speaker support). Added an optional `body.model` field so future Pro-tier or newer Flash models can be selected without a redeploy.
  `geminiTTS()` signature now takes `model` as a parameter; Cloudflare MeloTTS   + browser SpeechSynthesis fallbacks unchanged.

### Healer, learning, repos, MCP call, Hermes self-update shipped
These modules were untracked or uncommitted and not part of the live build.
Now committed:
- **`lib/healer.ts` + `app/api/healer/`** — self-healing engine (PM2, API, agent processes, disk, config, vault checks with auto-repair).
- **`lib/learning.ts` + `app/api/learning/`** — usage event store + behavioral profile builder (peak hours, fav tools, workflow sequences).
- **`app/api/repos/`** — list/clone/delete git repos; agent dispatch on cloned workspace paths.
- **`app/api/mcp/call/`** — call any connected MCP server tool directly.
- **`app/api/hermes/self-update/`** — Hermes self-update endpoint.
- **`lib/write-gate.ts` / `lib/write-gate.test.ts`** — write-gate module + tests.
- Health unit tests (`lib/health.test.ts`, 3 tests) + Vitest config already committed (Session 15/16 overlap).

### Docs refresh (README + CHANGELOG)
- **Fleet table & health-monitor section** — OpenCode → __Cline__ (headless dispatch, routing & cost, failover/reversion duty); added __ZCode__ as a second IDE launcher row.
- **Jarvis voice section** — noted the Gemini 3.1 Flash model and explained why the 30 prebuilt voices (Zephyr, Puck, Charon, Kore, …) appear in the orb UI.
- **Features section** — replaced the stale "OpenCode reclassified as IDE" bullet with a Cline + ZCode summary.
- **Intro blurb** — OpenCode → Cline.
- CHANGELOG bumped to __17 sessions__, __2026-05-31 → 2026-08-01__.

Build verified: `npm run build`, `npm test` (Vitest), `pm2 reload mission-control`.

---

## Session 19 — 2026-08-10 · Security-hardening admin boundary reconciled from Freebuff's branch

Merged the `security-hardening-admin-boundary` review branch (commit `6bf578b`) into the
live tree and reconciled it with Mission Control's existing features. The admin boundary is
now enforced by a unified **`MC_ADMIN_TOKEN`** — set in `.env.local` (gitignored), served to
the browser as an **HttpOnly `mc_admin_session` cookie** after a one-time login, and usable
as a **Bearer key** by CLI agents.

### Auth gate on every API route (edge middleware)
- **`middleware.ts`** — gates `/api/:path*` (everything except `/api/auth`); returns **503**
  if `MC_ADMIN_TOKEN` is unset, **401** on a missing/invalid credential.
- **`lib/admin-auth.ts`** — token/bearer/cookie/session validation + CSRF same-origin check.
- **`app/api/auth/route.ts`** — login sets the HttpOnly cookie; `secure` is keyed off
  `x-forwarded-proto` so loopback (`http://127.0.0.1`) and tunneled HTTPS both work.
- **`lib/settings.ts`** — `getGatewayToken()` now returns `MC_ADMIN_TOKEN` (one credential
  everywhere); the settings API no longer exposes the gateway token to clients.
- Old gateway-token holders re-pointed atomically (backups `.bak-mcadmin-20260810`):
  `.codex/.env`, `.vibe/.env` (`MC_GATEWAY_TOKEN`) and `.cline/.../providers.json` (`apiKey`).

### Cron / flows — gated, not neutered
- **`lib/safe-command.ts`** — `parseSafeCommand` rejects shell metacharacters
  (`;&|<>`$()\n\r`), the 2 kB cap, and **shell binaries** (`sh`, `cmd`, `powershell`, …) and
  **code-evaluator flags** (`node -e`, `python -c`, `npx -c`, …), while **real commands still
  run** (`git status`, `node scripts/backup.js`, …). `resolveCommandBinary` resolves PATH
  shims to their real `.exe`/`.cmd` so `spawn(..., { shell: false })` works on Windows.
- **`lib/cron.ts` + `lib/flows.ts`** — job/flow shell execution routes through the parser;
  `flow:` and `self-update:` commands keep their special handlers.
- **`app/api/cron/route.ts`** — PATCH of a `command` is validated before save.

### Terminal restore + raw-shell RCE removed
- **`lib/pty.ts`** — `zcode-cli` (auto-launches `zcode` in the repo workspace) and `cline`
  (shell for CLI/inspection; headless dispatch still routes via the Fleet Gateway) restored;
  the unguarded raw `shell` kind is rejected, session-id is guarded, writes capped at 64 kB.

### Build fix — edge runtime + discord.js
Adding `middleware.ts` turns on the edge compiler for `instrumentation.ts`, which lazy-imports
the Discord fleet bot. discord.js's pure-ESM sub-packages can't be bundled for edge, and
webpack's default edge external type (`module`) emits `module.exports = @discordjs/…` inside a
CJS wrapper — invalid JS the minifier rejects (`Expression expected`). **`next.config.mjs`**
now CJS-externalizes `discord.js`/`@discordjs/*` on every server compiler (identical to the
node build's existing `require()` externals; never evaluated in edge — `register()` returns
early). Also surface real minify errors: patched
`node_modules/next/.../minify-webpack-plugin/src/index.js` `WebpackError` → `.webpack.WebpackError`.

### Verified
- `npm test` — **23/23 passing** (security-boundaries + admin-auth suites added).
- `npm run build` — clean (edge + node), `next start` smoke-tested over loopback:
  `/api/settings` unauthenticated **401** → Bearer **200**; `/api/auth` login **200**; app
  shell **200**; `/api/cron`, `/api/gateway/models`, `/api/sessions`, `/api/agents`,
  `/api/health`, `/api/mcp` all **200** with the token.
- Deployed: `pm2 reload mission-control` (token inlined into the built middleware).

---

## Session 18 — 2026-08-10 · Hermes routed directly to OmniRoute; in-app gateway demoted to cold standby

Config/routing change only — no app source touched. Fleet-agent inference now sits
entirely on **OmniRoute**, the Fleet Gateway's maintained primary; Mission
Control's own in-app gateway drops to cold-standby backup.

### Hermes → OmniRoute (primary inference path)
- **`%LOCALAPPDATA%\hermes\config.yaml`** — model block re-pointed from OpenRouter
  (where it had drifted) to OmniRoute directly: `base_url: http://127.0.0.1:20128/v1`,
  `provider: custom`, `default: auto` (OmniRoute's virtual combo auto-fails across
  its connected providers), `api_key: hermes-omniroute` (OmniRoute accepts
  any/dummy bearer locally). Pre-edit config backed up to
  `config.yaml.bak-omniroute-20260810`.

### In-app gateway → cold standby (code untouched)
- **`lib/gateway.ts` + `app/api/gateway/[...path]`** — left intact; no longer the
  hot path for agents. It remains Mission Control's automatic failover when
  OmniRoute is unreachable (existing circuit breaker in `lib/omniroute.ts`). All
  documented gateway features (cascade, sticky sessions, vision routing, budgets,
  Anthropic bridge, analytics) still describe that backup path.

### Verified
- `hermes -z` reply routed through OmniRoute — call log shows `auto` → `opencode/big-pickle`.

Build verified: docs-only change — no rebuild needed; `pm2 reload mission-control` is a no-op on the running build.

---

## Session 16 — 2026-07-30 · Fleet restructuring — OpenCode removed → Cline added; ZCode added as second IDE launcher; Kilo cleanup

Three fleet changes in one pass: retire OpenCode entirely and replace its headless slot with **Cline**; add **ZCode** as a second desktop-IDE launcher alongside Antigravity (no meeting seat, no telemetry — purely an "Open in your real editor" escape hatch); and sweep the stale Kilo cosmetic leftovers (Kilo was already retired, replaced by Codex, but skins/theme/voice/RouteTransition references lingered).

### OpenCode removed → Cline added (headless fleet slot preserved)
- **`lib/registry.ts`** — removed the full `opencode` block; added a `cline` entry (`kind: "cli"`, `cline run "<task>"` headless dispatch, MCP support, provider-agnostic, parallel worktrees). `unverified: true` until the user installs `cline` and we confirm the exact flag — degrades to `offline` in the meantime like any missing agent.
- **`lib/subagents.ts`** — `headlessArgs("opencode")` → `headlessArgs("cline")` returning `["run", task]`.
- **`lib/healer.ts`** — primary-agent fallback chain now checks `cline` instead of `opencode`.
- **`lib/meeting.ts`** — `ORDER`, the `meta` table, three topic decisions, and the generalist `pool` all swapped `opencode` → `cline`; role text changed from "Provider-agnostic routing & cost" → "Headless dispatch & parallel runs".
- **`app/agents/[id]/page.tsx`** — the OpenCode special-case (Terminal vs Native TUI) is now keyed on `cline`; hint text now says `cline run "…" (headless zero-interaction)`.
- **`app/api/flows/generate/route.ts`** — agentId list in the LLM prompt now includes `cline` instead of `opencode`.
- **`app/api/agent-note/route.ts`** — curl example uses `X-MC-Agent: cline`.
- **`components/automation/FlowBuilder.tsx`** — agent picker lists `cline`.

> Provider entries unchanged: `lib/health.ts`, `lib/gateway.ts`, `lib/limits.ts`, `lib/settings.ts`, `app/settings/page.tsx`, and the `norm()` test in `lib/health.test.ts` still reference `opencode` — but those are the **OpenCode Zen free-tier gateway** (an upstream model provider routable via the Fleet Gateway), deliberately kept independent of the agent. Renaming them is a follow-up if you want a Cline-own provider entry.

### ZCode added — second desktop IDE launcher
ZCode on this machine is an **Electron + GLM desktop app** (`C:/Users/Amari/AppData/Local/Programs/ZCode/ZCode.exe`), not the Rust/GPU "Zed" editor. It's a GUI launcher, not a headless agent — so it sits in the IDE tier with Antigravity, no meeting seat, no telemetry.
- **`lib/registry.ts`** — new `zcode` entry, `kind: "ide"`, accent `#f04d8b`, `openCommand: { ZCode.exe }`, `sessionFormat: "none"`, `docsNote` says "no meeting seat, no telemetry loop".
- **`components/ide/AntigravityIde.tsx`** — added an "Open in ZCode ↗" button in the panel title bar (calls `POST /api/launch { id: "zcode" }`, reusing `lib/launch.ts`'s existing `kind === "ide"` path); added a third integrated-terminal tab "ZCode" rendering `<NativeTerminal session="zcode-cli" kind="zcode-cli" />` (a shell with `zcode`/`ZCode.exe` on PATH, CWD = `REPO_WORKSPACE_DIR`).
- **`lib/pty.ts`** — new `zcode-cli` kind in `SHELL_MODE` mapped to `zcode`; the IDE-shell `cwd` check now includes `zcode-cli` (uses `repoWorkspaceCwd()` like `antigravity-cli`).
- **Skins** — `components/skins/backgrounds.tsx` (`ZCodeBg` — magenta bloom over a circuit mesh), `components/skins/mascots.tsx` (`ZCodeMascot` — layered petals around a glowing core), `components/skins/index.tsx` (`zcode: { mood: "Bloom", type: "sans", ide: true }`).
- **`lib/theme.tsx`** + **`components/RouteTransition.tsx`** — new `zcode` accent entry `#f04d8b` (magenta) in all 5 theme palettes + the route-transition agent map. **`lib/voices.ts`** — new `zcode` voice entry.

### Kilo cosmetic leftovers swept
Kilo was already retired (replaced by Codex in Session 11) but cosmetic references lingered. Removed:
- **`components/skins/backgrounds.tsx`** + **`mascots.tsx`** — deleted `KiloBg` / `KiloMascot` and the `kilo` keys in both registries.
- **`components/skins/index.tsx`** — no Kilo entry existed (already gone).
- **`components/RouteTransition.tsx`**, **`components/AgentMetrics.tsx`**, **`lib/theme.tsx`** — removed the stale `kilo` entries.
- **`components/ide/HermesConsole.tsx`** — removed `["kilo", "Kilo Code", "#c0c6d4"]` from the FLEET accent map.
- **`app/layout.tsx`** + **`package.json`** — description strings now name Cline + ZCode instead of OpenCode + Kilo.
- **`lib/voices.ts`** — removed the `kilo` voice entry.
- **`lib/pty.ts`** — updated stale comments referencing opencode/kilo shims.

Build verified: `npm run build` ✓, `npm test` ✓ (3 tests).

---

## Session 15 — 2026-07-30 · Meeting decisions pipeline + flow triggers + cron flow execution + Hermes orchestration upgrade + OpenCode reclassify + MCP call endpoint + windowsHide patch

The meeting engine now extracts actionable decisions with resolved agent IDs and inferred action kinds, surfaced in the Meeting page and Hermes console. Flows gained cron/meeting triggers and an MCP action node. Cron jobs can run flows. Hermes Console drives flow runs, meeting decisions, and agent dispatch with Hermes fallback. OpenCode reclassified as IDE. New MCP call endpoint and windowsHide preload patch.

- **`lib/types.ts`** — new `MeetingDecision` type, `DecisionActionKind` enum (agent / flow.run / flow.create / cron / mcp / shell), `MeetingResp` and `MeetingReplyResp` now include `decisions: MeetingDecision[]`
- **`lib/meeting.ts`** — `resolveOwnerToAgentId()` maps human owner strings to roster agent IDs; `inferActionKind()` classifies decision text into one of six action kinds; `buildMeetingTemplated()` and `replyToMessage()` surface decisions with resolved `agentId`, `actionKind`, and `status: "pending"`
- **`app/api/meeting/route.ts`** — `POST` now returns `{ turns, decisions }` instead of just `turns`
- **`app/meeting/page.tsx`** — persists and renders decisions alongside turns; decision badges with action kind
- **`app/api/flows/generate/route.ts`** — LLM prompt updated with new node types: `trigger.cron` (`everyMinutes`), `trigger.meeting`, `action.mcp` (server, tool, args)
- **`lib/flows.ts`** — runner handles `trigger.cron` (logs schedule intent), `trigger.meeting` (logs convene request), `action.mcp` (calls `/api/mcp/call`)
- **`components/automation/FlowBuilder.tsx`** — palette adds Cron trigger (⏱, everyMinutes input) and Meeting trigger (🗣) nodes with inline config
- **`lib/cron.ts`** — jobs with `command: "flow:<flowId>"` execute the flow via `runFlow()` instead of spawning a shell
- **`components/ide/HermesConsole.tsx`** — new chat commands: `flow:run <id>`, `meeting:decide action | owner <owner> | kind <kind>`; decision badges with "Create decision" button; `@agent` dispatch with Hermes fallback; rewritten empty-state help
- **`lib/registry.ts`** — OpenCode `kind: "cli" → "ide"`, launch target = `@opencode-aidesktop/OpenCode.exe`, description "TUI client → Desktop GUI", `openCommand` added
- **`app/api/mcp/call/route.ts`** — new endpoint `POST { server, tool, args }` → calls MCP server tool directly via `callTool()`
- **`patches/preload-hide-windows.js`** — Node `--require` preload forcing `windowsHide: true` on `execSync`/`execFileSync` options when undefined (loaded via `NODE_OPTIONS`)
- **`next.config.mjs`** — `pm2`, `@discordjs/ws` in serverExternalPackages; webpack externals for `zlib-sync`, `cross-spawn`, `@discordjs/*`

Build verified: `npm run build`, `npm test` (3 tests pass).

---

## Session 14 — 2026-07-29 · Self-healing engine + behavioral learning

A health monitor that checks PM2, the API endpoint, agent processes, disk space,
and config integrity every 60s — plus auto-healing (PM2 restart, agent respawn,
disk cleanup). A parallel usage tracker records panel opens, agent invocations,
prompts, and session boundaries, then builds a behavioral profile (peak hours,
favorite tools, workflow sequences). Both exposed in a new Health panel in the
Antigravity IDE.

- **`lib/healer.ts`** — self-healing engine: 6 health checks (disk, pm2:mission-control, pm2:tunnel, api:endpoints, agents:installed, config:settings, vault:exists) with automatic repair strategies
- **`lib/learning.ts`** — usage event store + behavioral profile builder
  (peak hours, preferred panels/agents, workflow chains, session detection)
- **`app/api/healer/route.ts`** — `GET /api/healer` (health status),
  `POST /api/healer` (trigger repair)
- **`app/api/learning/route.ts`** — `POST /api/learning` (track event),
  `GET /api/learning/profile` (current profile)
- **`components/ide/AntigravityIde.tsx`** — Health panel with live status tiles,
  repair history, learning insights sidebar; Repos panel (clone UI, dispatch agents on repos); auto-tracks events on panel open, file open/save, agent dispatch, search, repo clone/delete via useEffect

**Fixes (same session):**
- **`lib/healer.ts`** — replaced `require.resolve("pm2/package.json")` with
  `process.cwd()` path to avoid webpack compiling it to a module ID
- **`lib/healer.ts`** — stripped ANSI escape codes from PM2 CLI output before
  JSON parsing (PM2 colorizes warnings with CSI sequences whose `[` characters
  broke `indexOf("[")`)
- **`lib/healer.ts`** — switched from `execSync` (routes through `cmd.exe` on
  Windows, causing terminal flash) to `execFile` with `process.execPath`
  (spawns `node.exe` directly, no `cmd.exe`, no flash)

Build verified: `npm run build`, PM2 restart, health endpoint returns 200.

---

## Session 13 — 2026-07-28 · Repo workspace + clone UI + agent dispatch

A dedicated `REPO_WORKSPACE_DIR` (`/mnt/c/Users/Amari/mission-control/repos`) for
git repositories managed from within the Antigravity IDE. The Repos panel lists
clones, supports `git clone` via modal, and dispatches agents on the full
workspace path.

- **`lib/paths.ts`** — added `REPO_WORKSPACE_DIR` constant
- **`lib/pty.ts`** — agent terminals now use repo workspace CWD for
  antigravity-cli
- **`app/api/repos/route.ts`** — `GET /api/repos` (list clones with status),
  `POST /api/repos` (clone URL → repo dir), `DELETE /api/repos` (remove repo
  dir)
- **`components/AntigravityIde.tsx`** — Repos panel (scrollable repo cards with
  dir name, status badge, delete button) + CloneRepoModal (URL input, confirm,
  error handling, loading spinner)

Build verified: `npm run build`, PM2 restart.

---

## Session 12 — 2026-07-08 · Claude growth-audit hat swarm
Sentinel's hat swarm is security-only (754 pentest/IR/forensics playbooks) — it has
no social, SEO, or review tooling, so it can't be repurposed for a business audit.
Built a second, parallel hat swarm on the same pattern but aimed at a business's
online presence instead, for owners as a free value-add.

- **`lib/growth-hats.ts`** — six hats (Visibility/SEO, Social, Reputation, Website,
  Content, Competitive), each with a color deliberately disjoint from Sentinel's
  palette (teal/pink/coral/sky/lime/indigo vs. red/blue/purple/green/white/orange).
- **`app/api/growth/swarm/route.ts`** — deploys one headless Claude sub-agent per
  selected hat via the existing `deployGatewayRun`; fetches up to 6 target URLs
  (site + social profiles, reusing `collectTarget`) and shares that recon across
  every hat, tagged `agentId: "growth"`. Hat prompts explicitly forbid inventing
  metrics (follower counts, review counts, rankings) not present in the fetched
  recon — say what to check by hand instead.
- **`components/ide/GrowthSwarm.tsx`** — UI panel on the Claude agent page, same
  hat-swarm UX as Sentinel's.
- **Fixed a latent cross-contamination bug**: `SentinelSwarm.tsx`'s run filter only
  checked `label.endsWith("hat")`, which would've pulled Growth-swarm runs into
  Sentinel's feed (and vice versa) the moment a second swarm existed. Both
  components now also filter on `agentId` ("sentinel" / "growth").
- Verified live: build + PM2 reload, hit `/api/growth/swarm`, deployed a Visibility
  hat against a real URL — confirmed it grounded findings in the actually-fetched
  page content rather than fabricating anything. `b97cf6e`.

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
