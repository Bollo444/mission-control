# Hermes Delegation Loop — Design Spec

**Date:** 2026-08-12
**Status:** Approved (design), pending implementation plan
**Goal:** Give Hermes a real orchestration loop — create a task contract, have the
target agent's own model decide whether to accept it, dispatch the accepted job to
the target's hub-side CLI instance as a tracked run, and report the outcome back to
Hermes. Everything surfaces live in the dashboard from a single persistent task
store. Part of the larger Hermes/Jarvis voice-command vision; this spec covers the
delegation core only.

---

## Context

- Mission Control already has the primitive pieces: `lib/subagents.ts`
  (`deploySubagent` headless spawn + `subagents.json` store, 5-min timeout,
  `checkShellPermission` write-gate), `lib/meeting.ts` (PERSONAS, decisions with
  resolved `agentId` + `actionKind`, `inferActionKind`, `resolveOwnerToAgentId`),
  `lib/gateway.ts` (`cascadeChat`), `lib/meeting-llm.ts` (`llmTurn`),
  `lib/write-gate.ts`, `lib/registry.ts` (`getAgent`).
- What does **not** exist: anything that links these into a tracked, resumable,
  Hermes-orchestrated task lifecycle. A meeting "decision to delegate" today is a
  generated persona line — wiring it to an actual headless run *is* the build.
- The user's model: "Hermes tasks jcode → meeting-side jcode accepts → hub-side
  jcode (in the jcode tab) runs the job → meeting-side jcode stands by and reports
  the output back to Hermes." That is the two-hop chain this spec realizes.

## Decisions (from brainstorming)

1. **Architecture A — task store engine.** A persistent `tasks.json` is the single
   source of truth; the whole loop is state transitions over it. Everything
   (task board, meeting feed, hub card, future voice orb) reads the same file.
2. **Two-hop chain:** Hermes-orchestrator creates a `DelegationTask` contract →
   the target's model reviews it and accepts/declines (agent-decided) → on accept,
   `deploySubagent` runs the real instruction against the hub instance → on run
   completion, a report-back turn summarizes the real output for Hermes.
3. **Async + live status.** The run is tracked in `subagents.json`; the task card
   streams real status. A `pm2 reload` or crash mid-run leaves the task at
   `running`; the next poll reconciles against `subagents.json` and resumes.
4. **Agent-decided acceptance.** The target's routed model reviews the contract and
   can decline with a reason; a decline bounces back to Hermes to re-scope/reassign.
5. **No simulated data (hard rule).** Every state, reason, output, and error shown
   is real stored model text or real process output. Empty fields render honestly.

---

## 1. Task store + state machine

Single file: `~/.mission-control/tasks.json` (same dir as `subagents.json` /
`settings.json`). The store module exposes `listTasks`, `getTask`, `createTask`,
`transitionTask` (validate + persist), `updateRun`, `setReport`. Writes are
atomic (write-temp-then-rename); `updatedAt` bumped on every mutation.

### `DelegationTask`

```ts
type TaskState =
  | "proposed"   // contract created; awaiting target's decision
  | "declined"   // target's model declined (reason stored)
  | "running"    // target accepted; a hub run is live
  | "done"       // run finished; report captured (or honest note)
  | "error";     // run failed / timed out / acceptance LLM blew up

interface DelegationTask {
  id: string;                // tsk_<ts>_<rand>
  summary: string;           // one-line human title for the board
  task: string;              // the actual instruction contract
  target: string;            // registry agent id, e.g. "jcode"
  proposedBy: "hermes" | "user";
  context?: string;          // supporting notes
  successCriteria?: string;  // optional "done when…"
  scope: {
    write?: boolean;
    vault?: boolean;
    gateway?: boolean;
    shell?: boolean;
  };
  state: TaskState;
  acceptReason?: string;     // real LLM text
  declineReason?: string;    // real LLM text
  run?: {
    id: string;              // subagent run id
    status: "running" | "done" | "error";
    output?: string;         // real captured run output
    exitCode?: number | null;
    startedAt: string;
    endedAt?: string;
  };
  report?: {
    text: string;            // real LLM summary
    generatedAt: string;
  };
  parentTaskId?: string;     // re-scoped child of a declined/failed task
  accept_error?: string;     // real LLM error text, if acceptance turn failed
  run_error?: string;        // real error text, if run failed
  scope_error?: string;      // write-gate rejection detail
  createdAt: string;
  updatedAt: string;
}
```

### Transitions

```
proposed ──accept──▶ running ──run completes──▶ done
   │                    │
   │ decline            └─run fails / times out──▶ error
   ▼
declined ──reassign──▶ proposed (re-scoped / re-targeted child)
```

Every transition is a real event; the UI reflects exactly the stored state.

## 2. Two-hop orchestration flow

Four LLM-orchestrated steps, each writing its result into the task record. All
turns use the existing routing (`cascadeChat` / `llmTurn`), so the target's real
model answers.

**Hop 0 — Hermes creates the contract.** Hermes-orchestrator (an LLM function)
turns a user ask, a meeting `actionKind: "agent"` decision, or an autonomous health
finding into a structured `DelegationTask`: target, instruction, success criteria,
declared scope. Task lands `proposed`. A user can also create one directly from the
UI.

**Hop 1 — the target decides (agent-decided).** A real LLM turn against the
target's routed model reviews the contract and returns `{ decision: "accept" |
"decline", reason }`. Accept → `running`; decline → `declined` with the stored
reason. Decline bounces to Hermes to re-scope/reassign (`parentTaskId` links the
child). If the LLM turn itself fails → task stays `proposed`, `accept_error` set.

**Hop 2 — hub dispatch.** On accept, `deploySubagent(target, task, label, {
callerAgentId: "hermes" })` launches the real headless run. The `subagents.json`
run id is linked into `task.run`; the run's real output streams back. Status flips
`running → done/error` as the process actually exits.

**Hop 3 — report-back.** On run completion, a report-back turn (target's model)
summarizes the real run output into `report.text`; task → `done`. On run failure
or timeout → `error` with `run_error`; Hermes may propose a re-scoped child.

The "meeting-side coordinator" is not a new long-lived agent — it is a per-task
role played by real model calls against the target's routed model. No simulated
personas.

## 3. UI — task board, meeting feed, hub card (real data only)

- **Task board** (Kanban-style): reads `tasks.json` directly; cards show id,
  summary, state, target, timestamps; click → modal with the full task JSON
  including reasons, run, report. Empty fields render "–".
- **Meeting feed**: real LLM-generated lifecycle lines (accept / decline / run
  start / run end / report / error), appended from the store. Honest "no response"
  only when the LLM truly produced nothing.
- **Hub card**: shows the live run (`run.status`, `run.output` preview +
  downloadable full output, `exitCode`, started/ended). "⏳ pending" if not yet
  started; stored reason shown for `declined`/`error`. No fake progress bars.
- **Future voice orb** (separate phase): same store, thin wrapper.

Every element traces to a real process or a real model response. No mock data.

## 4. Write-gate / scope security, error handling, testing

### Scope enforcement

`checkShellPermission` currently denies non-Sentinel agent→agent dispatch. This
design relaxes it **only** for tasks whose declared `scope` permits the operation:

- `DelegationTask.scope` declares what the task may touch.
- `deploySubagent` reads `scope` + `callerAgentId`; a task explicitly scoped for
  the operation (and proposed by `hermes`/`user`) may dispatch, otherwise the
  existing gate still applies. Nothing outside a declared scope is allowed; the
  write-gate still logs denials (`denyLog`).
- No scope requested → dispatch stays denied (fail-closed). Sentinel review of a
  declined scope remains the escalation path.

### Error paths (all real, all shown)

| Failure | State effect | UI |
|---|---|---|
| Acceptance LLM error | stays `proposed`, `accept_error` set | "❌ Acceptance failed: \<error\>" |
| Hub run timeout / non-zero exit | `run.status="error"`, `run_error` set | "⚠️ Run failed (exit \<code\>)" |
| Report generation failure | `done` (run succeeded), `report.text` = honest note | "(report couldn't be generated — run output attached)" |
| Scope violation | dispatch rejected; task stays put, `scope_error` set | highlight mismatch |

### Testing

- `tests/orchestrator.test.ts` (vitest, in-memory store):
  - State-machine transitions for every path (accept → running → done/error,
    decline → re-assign child, accept_error, scope rejection).
  - Contract validation (Zod schema rejects malformed tasks).
  - Write-gate: scope-based allowance vs fail-closed denial.
- Integration (real `deploySubagent`): create task → accept → dispatch → assert
  `run.status`/`output` populate and the task record updates; kill the subprocess
  to confirm timeout → `error` + `run_error`.
- E2E smoke: create via UI → feed updates → accept → hub run completes → report
  appears → `done`. Repeat with an out-of-scope task and confirm the gate blocks.

## Implementation order (for the plan)

1. `lib/orchestrator.ts` — store module + state machine + schema validation.
2. Acceptance/report-back LLM turns (routed through `llmTurn`/`cascadeChat`).
3. `deploySubagent` scope-awareness in `lib/subagents.ts` (reconcile write-gate).
4. API routes (`/api/orchestrator/*`) + task board UI + meeting-feed events + hub
   card wiring.
5. Hermes-orchestrator contract creation (user asks + meeting decisions).
6. Tests throughout; build + smoke; deploy (build + `pm2 reload`).

## Out of scope (v1)

- Realtime voice orb (Gemini/Grok/NVIDIA) — separate phase, same store.
- Proactive voice reach-out.
- Multi-agent fan-out beyond single-target tasks (parent/child re-assign covers
  retries).
