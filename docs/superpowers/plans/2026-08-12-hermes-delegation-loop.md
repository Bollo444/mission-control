# Hermes Delegation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Hermes delegation loop with task store, two-hop orchestration flow, UI components, and testing.

**Architecture:** Hermes creates a DelegationTask contract; target model decides accept/decline; hub dispatches real run via deploySubagent; report-back turn summarizes outcome. All state persisted in tasks.json with atomic writes.

**Tech Stack:** Next.js 15, TypeScript, Node.js, existing lib files (subagents.ts, meeting.ts, gateway.ts, etc.), Vitest for testing, PM2 for runtime.

**Source of truth for behavior:** `docs/superpowers/specs/2026-08-12-hermes-delegation-loop-design.md` (approved design). If a step below is ambiguous, the spec wins.

## Global Constraints

- Follow CLAUDE.md: commit locally; do NOT push unless explicitly asked.
- After edits, run typechecker AND execute affected entry point / path before reporting done.
- Use Bash tool (not PowerShell) for `claude mcp add`, package installs, and any command with a `--` separator. PowerShell mangles `--`.
- No simulated data; all UI and output must be real.
- Use Bash for commands with `--` separator.
- Ensure typechecker passes and runtime works.

## Steps

### 1. Task store + state machine

- [x] `lib/DelegationTask.ts` — contract type: TaskState (`proposed | declined | running | done | error`), full DelegationTask interface (id, summary, task, target, proposedBy, scope, run, report, error fields, timestamps).
- [x] `lib/taskStore.ts` — persistent store at `~/.mission-control/tasks.json` (same dir as subagents.json). Atomic writes (temp-file-then-rename). Lazy `tasksFilePath()` honors `MC_TASKS_FILE` env override for tests.
- [x] `createTask` — validates required contract fields (summary/task/target/proposedBy), auto-generates `tsk_<ts>_<rand>` id, sets createdAt/updatedAt.
- [x] `transitionTask` — validates the state machine (`proposed→running|declined`, `running→done|error`, `declined→proposed`, `error→proposed`); rejects invalid transitions; merges patch fields in the same atomic write.
- [x] `patchTask` — merge fields (accept_error, scope_error, reasons) WITHOUT a state transition.
- [x] `updateRun` / `setReport` — persist real run/report data, bump updatedAt.

### 2. Two-hop orchestration flow (`lib/orchestrator.ts`)

- [x] Hop 0 — `proposeTask(input)` creates the contract in `proposed`.
- [x] Hop 1 — `decideTask(id)` runs a REAL acceptance LLM turn against the target's routed model (via cascadeChat, same routing as meeting-llm). Accept → `running` + acceptReason; decline → `declined` + declineReason; LLM failure → stays `proposed` with `accept_error` (honest).
- [x] Hop 2 — `dispatchRun(id)` requires `running`; calls `deploySubagent(target, task, label, { callerAgentId: "hermes", scope, proposedBy })`; links the real run id into task.run; dispatch failure → `error` + `run_error`.
- [x] Hop 3 — `reportBack(id)` runs a REAL report-back turn summarizing the actual run output into `report.text`; task → `done`. Empty/unparseable model response → honest fallback note, run output attached.
- [x] `reconcileRun(id)` — syncs a `running` task against subagents.json (crash/pm2-reload safe): run done → report back → done; run error → `error` + real `run_error`.

### 3. Scope security (`lib/subagents.ts`)

- [x] `deploySubagent` accepts `scope` + `proposedBy`; a task explicitly declaring scope and proposed by hermes/user may dispatch (logged). No scope declared → existing write-gate stays fail-closed.

### 4. API routes + UI

- [x] `app/api/orchestrator/route.ts` — GET list, POST create.
- [x] `app/api/orchestrator/[id]/route.ts` — GET single task.
- [x] `app/api/orchestrator/[id]/decide/route.ts` — POST Hop 1 acceptance.
- [x] `app/api/orchestrator/[id]/dispatch/route.ts` — POST Hop 2 dispatch.
- [x] `app/api/orchestrator/[id]/reconcile/route.ts` — POST sync + report-back.
- [x] `components/TaskBoard.tsx` — live board polling the API: cards by state, create-contract form with declared scope, per-state actions (ask target / poll & report / view details), full-JSON modal. Real data only.
- [x] `app/delegation/page.tsx` + sidebar nav link.

### 5. Hermes-orchestrator contract creation (future wiring)

- [ ] Wire meeting `actionKind: "agent"` decisions and user asks in the command orb into `proposeTask` (Hop 0).
- [ ] Meeting-feed lifecycle lines (accept/decline/run start/end/report/error) appended from the store.
- [ ] Hub card showing the live run (status, output preview, exitCode, timestamps).

### 6. Tests & validation

- [x] `tests/lib/taskStore.test.ts` — vitest, temp-dir isolation via `MC_TASKS_FILE`; covers create/get/list, validation rejects, full state machine, atomic round-trip.
- [x] `tests/orchestrator.test.ts` — vitest; mocks cascadeChat + deploySubagent; covers accept→dispatch→reconcile→done with real report, decline, accept_error, dispatch failure, run failure, honest report fallback.
- [x] `npx tsc --noEmit` passes.
- [x] `npx vitest run` passes.
- [x] `npm run build` green + smoke the /delegation page.
- [ ] Deploy: `pm2 reload` after build.
