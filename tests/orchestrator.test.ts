import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import type { SubagentRun } from "../lib/subagents";
import type { CascadeOk } from "../lib/gateway";

vi.mock("../lib/settings", () => ({
  readSettings: () => ({
    routingPreferred: { jcode: { provider: "mock", model: "mock-1" } },
    routing: {},
  }),
}));

vi.mock("../lib/gateway", () => ({
  cascadeChat: vi.fn(),
}));

vi.mock("../lib/subagents", () => ({
  deploySubagent: vi.fn(),
  listRuns: vi.fn(),
}));

import { cascadeChat } from "../lib/gateway";
import { deploySubagent, listRuns } from "../lib/subagents";
import {
  proposeTask,
  decideTask,
  dispatchRun,
  reportBack,
  reconcileRun,
} from "../lib/orchestrator";
import { getTask, listTasks, createTask, transitionTask } from "../lib/taskStore";

const TMP = path.join(os.tmpdir(), `mc-orch-test-${Date.now()}`);
const TASKS_FILE = path.join(TMP, "tasks.json");

const mockedChat = vi.mocked(cascadeChat);
const mockedDeploy = vi.mocked(deploySubagent);
const mockedListRuns = vi.mocked(listRuns);

function llmOk(content: string): CascadeOk {
  return {
    ok: true,
    served: { provider: "mock", model: "mock-1" },
    attempts: 1,
    response: new Response(
      JSON.stringify({ choices: [{ message: { content } }] })
    ),
  };
}

beforeAll(async () => {
  process.env.MC_TASKS_FILE = TASKS_FILE;
  await fs.mkdir(TMP, { recursive: true });
});

afterAll(async () => {
  delete process.env.MC_TASKS_FILE;
  await fs.rm(TMP, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.writeFile(TASKS_FILE, "[]", "utf8");
  mockedChat.mockReset();
  mockedDeploy.mockReset();
  mockedListRuns.mockReset();
});

describe("two-hop delegation loop", () => {
  it("runs the full flow: propose → accept → dispatch → reconcile → done with report", async () => {
    const t = await proposeTask({
      summary: "Fix auth",
      task: "Refactor the auth middleware",
      target: "jcode",
      proposedBy: "hermes",
      scope: { write: true },
    });
    expect(t.state).toBe("proposed");

    // Hop 1 — target's model accepts
    mockedChat.mockResolvedValueOnce(llmOk('{"decision":"accept","reason":"on it"}'));
    mockedDeploy.mockReturnValueOnce({
      ok: true,
      run: {
        id: "sub_abc",
        agentId: "jcode",
        agentName: "jcode",
        task: "Refactor the auth middleware",
        status: "running",
        startedAt: Date.now(),
        endedAt: null,
        exitCode: null,
        output: "",
      } as SubagentRun,
    });

    const decided = await decideTask(t.id);
    expect(decided.decision).toBe("accept");
    expect(decided.reason).toBe("on it");

    const afterAccept = await getTask(t.id);
    expect(afterAccept?.state).toBe("running");
    expect(afterAccept?.acceptReason).toBe("on it");
    expect(afterAccept?.run?.id).toBe("sub_abc");
    expect(mockedDeploy).toHaveBeenCalledWith(
      "jcode",
      "Refactor the auth middleware",
      `delegation-${t.id}`,
      expect.objectContaining({ callerAgentId: "hermes", scope: { write: true } })
    );

    // Hop 2/3 — run finished; reconcile reports back
    mockedListRuns.mockReturnValueOnce([
      {
        id: "sub_abc",
        agentId: "jcode",
        agentName: "jcode",
        task: "Refactor the auth middleware",
        status: "done",
        startedAt: Date.now(),
        endedAt: Date.now(),
        exitCode: 0,
        output: "auth refactored, tests green",
      } as SubagentRun,
    ]);
    mockedChat.mockResolvedValueOnce(llmOk("Refactored the auth middleware; all tests pass."));

    const reconciled = await reconcileRun(t.id);
    expect(reconciled?.state).toBe("done");
    expect(reconciled?.report?.text).toBe("Refactored the auth middleware; all tests pass.");
    expect(reconciled?.run?.status).toBe("done");
    expect(reconciled?.run?.exitCode).toBe(0);
  });

  it("declines when the target's model declines, storing the reason", async () => {
    const t = await proposeTask({
      summary: "Hard thing",
      task: "Rewrite the kernel",
      target: "jcode",
      proposedBy: "hermes",
    });
    mockedChat.mockResolvedValueOnce(llmOk('{"decision":"decline","reason":"out of scope"}'));
    const decided = await decideTask(t.id);
    expect(decided.decision).toBe("decline");
    const task = await getTask(t.id);
    expect(task?.state).toBe("declined");
    expect(task?.declineReason).toBe("out of scope");
  });

  it("stays proposed with accept_error when the acceptance LLM fails or is unparseable", async () => {
    const t = await proposeTask({
      summary: "Blurry",
      task: "Do something vague",
      target: "jcode",
      proposedBy: "hermes",
    });
    mockedChat.mockResolvedValueOnce(llmOk("I like turtles"));
    const decided = await decideTask(t.id);
    expect(decided.decision).toBe("error");
    const task = await getTask(t.id);
    expect(task?.state).toBe("proposed");
    expect(task?.accept_error).toContain("unparseable");
  });

  it("decideTask rejects a task that is not proposed", async () => {
    await createTask({
      id: "tsk_done",
      summary: "x",
      task: "y",
      target: "jcode",
      proposedBy: "hermes",
      state: "done",
    } as never);
    const decided = await decideTask("tsk_done");
    expect(decided.decision).toBe("error");
    expect(decided.error).toContain("not in proposed state");
  });

  it("dispatchRun requires a running task and marks error with run_error on failure", async () => {
    await createTask({
      id: "tsk_d2",
      summary: "x",
      task: "y",
      target: "jcode",
      proposedBy: "hermes",
      state: "proposed",
    } as never);
    const blocked = await dispatchRun("tsk_d2");
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("not in running state");

    await transitionTask("tsk_d2", "running");
    mockedDeploy.mockReturnValueOnce({ ok: false, error: "jcode is not installed" });
    const failed = await dispatchRun("tsk_d2");
    expect(failed.ok).toBe(false);
    const task = await getTask("tsk_d2");
    expect(task?.state).toBe("error");
    expect(task?.run_error).toBe("jcode is not installed");
  });

  it("dispatchRun routes a scope denial to scope_error and keeps the task put", async () => {
    const t = await proposeTask({
      summary: "x",
      task: "y",
      target: "jcode",
      proposedBy: "hermes",
      scope: { write: false, vault: false, gateway: false, shell: false },
    });
    await transitionTask(t.id, "running");
    mockedDeploy.mockReturnValueOnce({
      ok: false,
      error: "no scope declared on the delegation task — dispatch denied (fail-closed)",
      denied: true,
    });
    const result = await dispatchRun(t.id);
    expect(result.ok).toBe(false);
    expect(result.denied).toBe(true);
    const task = await getTask(t.id);
    expect(task?.state).toBe("running"); // stays put — not error
    expect(task?.scope_error).toContain("fail-closed");
  });

  it("reconcileRun marks error with real run_error when the run failed", async () => {
    const t = await proposeTask({
      summary: "x",
      task: "y",
      target: "jcode",
      proposedBy: "hermes",
    });
    await transitionTask(t.id, "running");
    await (await import("../lib/taskStore")).updateRun(t.id, {
      id: "sub_bad",
      status: "running",
      startedAt: new Date().toISOString(),
      exitCode: null,
    });
    mockedListRuns.mockReturnValueOnce([
      {
        id: "sub_bad",
        agentId: "jcode",
        agentName: "jcode",
        task: "y",
        status: "error",
        startedAt: Date.now(),
        endedAt: Date.now(),
        exitCode: 2,
        output: "boom: syntax error",
      } as SubagentRun,
    ]);
    const task = await reconcileRun(t.id);
    expect(task?.state).toBe("error");
    expect(task?.run_error).toBe("boom: syntax error");
  });

  it("reportBack attaches the real report text and lands done", async () => {
    const t = await proposeTask({
      summary: "x",
      task: "y",
      target: "jcode",
      proposedBy: "hermes",
    });
    await transitionTask(t.id, "running");
    await (await import("../lib/taskStore")).updateRun(t.id, {
      id: "sub_r",
      status: "done",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      exitCode: 0,
      output: "real output here",
    });
    mockedChat.mockResolvedValueOnce(llmOk("The real outcome."));
    const task = await reportBack(t.id);
    expect(task?.state).toBe("done");
    expect(task?.report?.text).toBe("The real outcome.");
  });

  it("reports an honest fallback when the report LLM returns nothing", async () => {
    const t = await proposeTask({
      summary: "x",
      task: "y",
      target: "jcode",
      proposedBy: "hermes",
    });
    await transitionTask(t.id, "running");
    await (await import("../lib/taskStore")).updateRun(t.id, {
      id: "sub_r2",
      status: "done",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      exitCode: 0,
      output: "some output",
    });
    mockedChat.mockResolvedValueOnce(llmOk(""));
    const task = await reportBack(t.id);
    expect(task?.state).toBe("done");
    expect(task?.report?.text).toContain("couldn't be generated");
  });

  it("keeps the store real — listTasks reflects every transition", async () => {
    await proposeTask({ summary: "a", task: "1", target: "jcode", proposedBy: "hermes" });
    await proposeTask({ summary: "b", task: "2", target: "jcode", proposedBy: "user" });
    const tasks = await listTasks();
    expect(tasks.length).toBe(2);
    expect(tasks.every((t) => t.state === "proposed")).toBe(true);
  });
});
