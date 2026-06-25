# Codex Overhaul — Design Spec

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation plan
**Goal:** Replace the broken `kilo` fleet slot with **Codex** (OpenAI's `codex` CLI),
aligned to the Mission Control gateway for free model fallback, with a distinctive
noir dashboard console that surfaces *all* of Codex's features.

---

## Context

- `kilo` is dead on this machine (Bun/OpenTUI `bun:ffi` disabled — environmental,
  unfixable from MC). It occupies one of the 10 fleet slots.
- `codex` is installed (`~/AppData/Roaming/npm/codex` + `codex.cmd`), feature-rich:
  `exec`, `review`, `mcp`, `plugin` (+ `marketplace`), `cloud`, `sandbox`,
  `resume`/`fork`/`archive`, `app`/`app-server`, `doctor`. Config at
  `~/.codex/config.toml` (not yet created; not logged in).
- The embedded-terminal `.cmd` spawn fix (`lib/pty.ts` → `cmd.exe /c`) already makes
  Codex's native TUI runnable in-browser.

## Decisions (from brainstorming)

1. **Replace** the kilo slot with Codex (id/name/theme/registry all become Codex).
2. Create **both** `~/.codex/AGENTS.md` (Codex's native instructions file) **and** a
   Mission Control vault note `Agents/Codex.md`.
3. Visual: **Codex-authentic noir** — deep near-black, crisp monospace, electric
   green-cyan accent (`#10a37f`), hairline grid, subtle scanline/CRT glow.
4. **Fully wired** — every feature area backed by real data, not stubs.

---

## 1. Identity swap (kilo → Codex)

`lib/registry.ts` — the kilo entry becomes:
- `id: "codex"`, `name: "Codex"`, `accent: "#10a37f"`, glyph (e.g. `⌥`/`▰`), `primary: false`.
- `bin: "codex"`, `binPaths: [npm/codex.cmd]` (resolveBinary handles PATHEXT).
- `configPaths: [~/.codex/config.toml, ~/.codex/AGENTS.md]`, `configFormat: "toml"`.
- `sessionsDir: ~/.codex/sessions`, `sessionFormat: "generic"` (or codex-specific).
- `launch: { cmd: "codex", args: [] }`.
- `install: { manager: "npm", command: "npm install -g @openai/codex" }`.
- `marketplace: <codex plugin marketplace url>` (or omit; surfaced in-panel instead).
- `tools: ["Native TUI", "Plugins / apps", "MCP servers", "Codex Cloud", "Code review", "Sandbox", "Sessions (resume/fork)"]`.
- `homepage: "https://openai.com/codex"` (verify).

New `skin.codex` flag in `components/skins/index.tsx` → agent page routes to
`CodexConsole`. **Sweep all `kilo` references** (skins, the `FLEET` arrays in
`HermesConsole.tsx` and the meeting, any id checks) → `codex`.

## 2. Gateway alignment (free fallback)

Write `~/.codex/config.toml`:
```toml
model = "auto"
model_provider = "mission-control"

[model_providers.mission-control]
name = "Mission Control Gateway"
base_url = "http://127.0.0.1:4317/api/gateway/v1"
env_key = "MC_GATEWAY_TOKEN"
wire_api = "chat"          # OpenAI chat-completions style
```
Plus `MC_GATEWAY_TOKEN` available to codex's env (write to `~/.codex/.env` or set
in the launch env). Codex then runs on the free fleet; the gateway's cross-provider
cascade *is* the model fallback. (Verify exact codex `config.toml` provider keys
against `codex` docs during implementation; adjust `wire_api`/`env_key` as needed.)

A small **"Align to gateway"** action in the console writes/repairs this config
(idempotent), so it's reproducible for cloners.

## 3. AGENTS.md + vault note

- `~/.codex/AGENTS.md` — Codex's standing persona/instructions (fleet role, gateway
  usage, authorized-only posture). Created idempotently.
- `Agents/Codex.md` — Mission Control vault note (Mission / Excels at / Memory / Log),
  matching the other agents' vault notes.

## 4. CodexConsole — noir panel (frontend-design)

`components/ide/CodexConsole.tsx`, gated by `skin.codex`. Theme tokens: near-black
base, mono type, `#10a37f` accent + a brighter hover, hairline grid background,
faint scanline/CRT vignette. Hero with Codex identity + "ready" pill + gateway
status. Tab bar (mirrors the Hermes console pattern, its own theme):

- **Session** — `NativeTerminal kind="codex"` (real TUI, survives navigation).
- **Plugins** (apps library) — `codex plugin list` + `marketplace list`; install/remove via `codex plugin add/remove`.
- **MCP** — `codex mcp list/get`; add/remove servers.
- **Cloud** — `codex cloud` task list (experimental; degrade gracefully).
- **Sessions** — list saved sessions (`resume`/`fork`/`archive`); click → conversation modal (reuse `readConversation`/SessionList pattern).
- **Review** — trigger `codex review` (non-interactive) on a path; show result.
- **Prompts/Profiles** — Codex custom prompts + config profiles (the "custom chatbots").

## 5. Data layer + API

`lib/codex-data.ts` — typed helpers that shell out to `codex <sub> --json` where
available (else parse text) and read `~/.codex`:
`getPlugins()`, `getMarketplaces()`, `getMcpServers()`, `getSessions()`,
`getCloudTasks()`, `getProfiles()`, `getConfig()`, `alignGateway()`.

API routes under `app/api/codex/`: `plugins`, `mcp`, `sessions`, `cloud`,
`profiles`, `config` (GET state; POST actions like add/remove/align). All shell
calls use the `.cmd`-safe spawn (shell on win32), time-boxed, output-capped.

## 6. Implementation order

1. **Foundation**: registry swap + skin flag + sweep kilo refs; `alignGateway()` writes config.toml + AGENTS.md + vault note; verify Codex TUI loads on the gateway.
2. **Console shell**: themed CodexConsole + tab bar + Session (native TUI).
3. **Feature tabs**, one at a time, each with its data layer + API: Plugins → MCP → Sessions → Profiles/Prompts → Review → Cloud.
4. **Polish** with frontend-design (scanline/grid/accents, motion).

## Risks / unknowns (resolve during implementation)

- Exact `~/.codex/config.toml` provider schema (`wire_api`, `env_key` vs inline key) — verify against codex docs/`codex doctor`.
- Whether `codex plugin/mcp/cloud` support `--json`; if not, parse text output.
- Codex session storage format/location (only `~/.codex/tmp` exists pre-use).
- Codex auth: confirm the custom gateway provider bypasses OpenAI login.

## Out of scope (v1)

- Codex desktop `app`/`app-server` embedding.
- Rewriting the generic agent page; CodexConsole is a dedicated surface like Hermes/OpenClaw.
