# Codex Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) or subagent-driven-development. Steps use `- [ ]` tracking.

**Goal:** Replace the dead `kilo` fleet slot with OpenAI **Codex**, aligned to the Mission Control gateway for free fallback, with a noir CodexConsole surfacing all Codex features.

**Architecture:** Registry identity swap + a `skin.codex` flag routing the agent page to a dedicated `CodexConsole` (like Hermes/OpenClaw). A `lib/codex-data.ts` data layer shells out to `codex` subcommands and reads `~/.codex`; thin `app/api/codex/*` routes expose it. Gateway alignment writes `~/.codex/config.toml` + `AGENTS.md`. Built with the frontend-design skill for the noir look.

**Tech Stack:** Next.js 15 / React 19 / TS / Tailwind v4; existing `NativeTerminal` (ConPTY), `child_process` (shell-safe spawn), `@iarna/toml`.

## Global Constraints (verbatim from spec)
- Accent `#10a37f`; noir theme (near-black, mono, hairline grid, scanline glow).
- Codex runs through the gateway (`http://127.0.0.1:4317/api/gateway/v1`, token `MC_GATEWAY_TOKEN`, model `auto`) — no OpenAI login.
- Shell calls: shell-safe on win32 (`.cmd`), time-boxed, output-capped.
- **Verification per task** (this codebase's pattern): `npx tsc --noEmit` (0 non-test errors) + `npm run build` (Compiled) + `pm2 restart mission-control` + a targeted `curl`/visual check. No unit-test framework.

---

### Task 1: Foundation — registry swap + skin flag + sweep kilo refs
**Files:** Modify `lib/registry.ts` (kilo entry → codex), `components/skins/index.tsx` (add `codex: {…, codex:true}`), `app/agents/[id]/page.tsx` (route `skin.codex` → CodexConsole, temporary placeholder), and grep-sweep `kilo` in `components/ide/HermesConsole.tsx` FLEET, `lib/meeting*.ts`, anywhere else.
**Produces:** agent id `codex`, `getAgent("codex")`, `skin.codex` flag.
- [ ] Swap the kilo registry object to Codex (id/name/accent/bin/binPaths/configPaths/sessionsDir/launch/install/tools/homepage/marketplace).
- [ ] Add `codex` skin with `codex: true` + accent; add `codex?: boolean` to the skin type.
- [ ] `grep -rn "kilo" lib components app` → update every id/label/FLEET reference to codex.
- [ ] Agent page: `if (skin.codex) return <CodexConsole agent={a} />;` (stub component returning a div for now).
- [ ] Verify: `tsc` clean, `npm run build`, `/api/agents` lists `codex` not `kilo`.
- [ ] Commit: `feat(codex): replace kilo slot with Codex identity`.

### Task 2: Gateway alignment + AGENTS.md + vault note
**Files:** Create `lib/codex-data.ts` (start with `alignGateway()`), `app/api/codex/config/route.ts`. Writes `~/.codex/config.toml`, `~/.codex/AGENTS.md`, vault `Agents/Codex.md`.
**Interfaces:** `alignGateway(): {ok, wrote: string[]}`, `getConfig(): {gatewayAligned: boolean, model: string|null, …}`.
- [ ] `alignGateway()`: idempotently write config.toml (`[model_providers.mission-control]` base_url/env_key/wire_api, `model="auto"`, `model_provider="mission-control"`), append `MC_GATEWAY_TOKEN` to `~/.codex/.env`, write AGENTS.md, write vault `Agents/Codex.md`. Verify the exact codex provider schema first via `codex --help`/docs; adjust keys.
- [ ] `GET /api/codex/config` → state; `POST {action:"align"}` → alignGateway().
- [ ] Verify: POST align, then `codex exec "say CODEX-OK"` (non-interactive) returns via the gateway (free). tsc + build.
- [ ] Commit: `feat(codex): gateway-aligned config + AGENTS.md + vault note`.

### Task 3: CodexConsole shell + Session tab (noir, native TUI)
**Files:** Create `components/ide/CodexConsole.tsx`. Uses `NativeTerminal kind="codex"`.
**Interfaces:** default export `CodexConsole({agent})`; tab state `new-session | plugins | mcp | sessions | prompts | review | cloud`.
- [ ] Build the noir shell: hero (Codex glyph, ready pill, gateway-aligned badge), tab bar, body. Theme tokens (#10a37f accent, near-black, hairline grid, scanline overlay). frontend-design skill drives the aesthetic.
- [ ] Session tab: `<NativeTerminal kind="codex" session="codex-main" accent="#10a37f" />` in a min-h-0 flex container (the proven layout).
- [ ] Verify: Codex page loads noir; TUI spawns (curl the pty stream → `ready`). tsc + build + pm2.
- [ ] Commit: `feat(codex): noir console shell + native Session tab`.

### Task 4: Plugins tab (apps library)
**Files:** `lib/codex-data.ts` (+`getPlugins`,`getMarketplaces`,`addPlugin`,`removePlugin`), `app/api/codex/plugins/route.ts`, `components/ide/codex/Plugins.tsx`.
- [ ] Data: shell `codex plugin list` + `codex plugin marketplace list` (try `--json`, else parse text); install/remove via `codex plugin add/remove`.
- [ ] API: GET (plugins + marketplaces), POST {action:add|remove, name}.
- [ ] UI: marketplace browser + installed list + install/remove buttons, noir styled.
- [ ] Verify: GET returns plugin/marketplace data; tsc + build. Commit `feat(codex): plugins (apps library) tab`.

### Task 5: MCP tab
**Files:** `lib/codex-data.ts` (+`getMcpServers`,`addMcp`,`removeMcp`), `app/api/codex/mcp/route.ts`, `components/ide/codex/Mcp.tsx`.
- [ ] Data: `codex mcp list`/`get`; add/remove via `codex mcp add/remove`.
- [ ] API GET list; POST add/remove. UI: server list + add form. Verify + commit `feat(codex): MCP servers tab`.

### Task 6: Sessions tab
**Files:** `lib/codex-data.ts` (+`getCodexSessions`), `app/api/codex/sessions/route.ts`, `components/ide/codex/Sessions.tsx`.
- [ ] Data: list saved sessions (codex session store under `~/.codex`; discover path at runtime). Reuse `readConversation` if format compatible; else parse codex format.
- [ ] UI: session list → click opens conversation modal (reuse the SessionList modal pattern). Resume/fork/archive actions via `codex resume/fork/archive`. Verify + commit `feat(codex): sessions tab`.

### Task 7: Prompts / Profiles tab (custom chatbots)
**Files:** `lib/codex-data.ts` (+`getProfiles`,`getPrompts`), `app/api/codex/profiles/route.ts`, `components/ide/codex/Profiles.tsx`.
- [ ] Data: read codex config profiles + custom prompts from `~/.codex` (discover format). UI: list + view. Verify + commit `feat(codex): prompts/profiles tab`.

### Task 8: Review tab
**Files:** `app/api/codex/review/route.ts`, `components/ide/codex/Review.tsx`.
- [ ] POST {path} → `codex review` non-interactive (time-boxed), return result. UI: path input + run + result pane. Verify + commit `feat(codex): code review tab`.

### Task 9: Cloud tab
**Files:** `lib/codex-data.ts` (+`getCloudTasks`), `app/api/codex/cloud/route.ts`, `components/ide/codex/Cloud.tsx`.
- [ ] Data: `codex cloud` task list (experimental → degrade gracefully to "not configured"). UI: task list. Verify + commit `feat(codex): cloud tasks tab`.

### Task 10: frontend-design polish
- [ ] Pass with frontend-design skill: scanline/CRT vignette, grid, accent motion, tab transitions, empty states. tsc + build + visual. Commit `polish(codex): noir console FIRE pass`.

## Self-review
- **Coverage:** spec §1 (Task 1), §2 (Task 2), §3 (Task 2), §4 console+tabs (Tasks 3–9), §5 data/API (folded into each tab task), §6 order (matches). Polish §4 → Task 10. ✓
- **Unknowns** (from spec Risks) resolved in-task: codex config schema (T2), `--json` support (T4+), session format (T6), auth bypass (T2 verify). ✓
- **Granularity:** each task ends in an independently buildable+verifiable deliverable. ✓
