import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  readTasks,
  writeTasks,
  createTask,
  getTask,
  listTasks,
  transitionTask,
  updateRun,
  setReport,
  patchTask,
} from "../../lib/taskStore";
import type { NewTaskInput } from "../../lib/taskStore";

const TMP = path.join(os.tmpdir(), `mc-taskstore-test-${Date.now()}`);
const TASKS_FILE = path.join(TMP, "tasks.json");

beforeAll(async () => {
  process.env.MC_TASKS_FILE = TASKS_FILE;
  await fs.mkdir(TMP, { recursive: true });
});

afterAll(async () => {
  delete process.env.MC_TASKS_FILE;
  await fs.rm(TMP, { recursive: true, force: true });
});

function task(overrides: Record<string, unknown> = {}): NewTaskInput {
  return {
    summary: "Test task",
    task: "Do the thing",
    target: "jcode",
    proposedBy: "hermes",
    ...overrides,
  } as unknown as NewTaskInput;
}

describe("task store", () => {
  it("readTasks returns [] when the file does not exist", async () => {
    expect(await readTasks()).toEqual([]);
  });

  it("createTask persists a task and returns it", async () => {
    const created = await createTask(task({ id: "tsk_1", summary: "First" }));
    expect(created.id).toBe("tsk_1");
    expect(created.state).toBe("proposed");
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();
    expect(await getTask("tsk_1")).toMatchObject({ id: "tsk_1", summary: "First" });
  });

  it("createTask generates an id when omitted", async () => {
    const created = await createTask(task({}));
    expect(created.id).toMatch(/^tsk_/);
  });

  it("createTask rejects malformed contracts", async () => {
    await expect(createTask({} as NewTaskInput)).rejects.toThrow("summary");
    await expect(createTask(task({ task: "" }))).rejects.toThrow("task");
    await expect(createTask(task({ target: "" }))).rejects.toThrow("target");
    await expect(createTask(task({ proposedBy: "zorp" }))).rejects.toThrow("proposedBy");
  });

  it("getTask returns null for unknown id", async () => {
    expect(await getTask("nope")).toBeNull();
  });

  it("listTasks returns all tasks", async () => {
    const tasks = await listTasks();
    expect(tasks.some((t) => t.id === "tsk_1")).toBe(true);
  });

  it("transitionTask validates the state machine", async () => {
    await createTask(task({ id: "tsk_flow" }));

    await transitionTask("tsk_flow", "running", { acceptReason: "on it" });
    expect((await getTask("tsk_flow"))?.state).toBe("running");
    expect((await getTask("tsk_flow"))?.acceptReason).toBe("on it");

    await expect(transitionTask("tsk_flow", "declined")).rejects.toThrow(
      "Invalid state transition"
    );

    await transitionTask("tsk_flow", "done");
    expect((await getTask("tsk_flow"))?.state).toBe("done");
    await expect(transitionTask("tsk_flow", "running")).rejects.toThrow(
      "Invalid state transition"
    );
  });

  it("transitionTask throws for unknown task", async () => {
    await expect(transitionTask("missing", "done")).rejects.toThrow("not found");
  });

  it("updateRun and setReport persist real run/report data", async () => {
    await createTask(task({ id: "tsk_run" }));
    await updateRun("tsk_run", {
      id: "sub_abc",
      status: "done",
      output: "real output",
      exitCode: 0,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    });
    await setReport("tsk_run", { text: "real summary", generatedAt: new Date().toISOString() });
    const t = await getTask("tsk_run");
    expect(t?.run?.status).toBe("done");
    expect(t?.run?.output).toBe("real output");
    expect(t?.report?.text).toBe("real summary");
  });

  it("patchTask merges fields without a state transition", async () => {
    await createTask(task({ id: "tsk_patch" }));
    await patchTask("tsk_patch", { accept_error: "LLM blew up" });
    const t = await getTask("tsk_patch");
    expect(t?.state).toBe("proposed");
    expect(t?.accept_error).toBe("LLM blew up");
  });

  it("writeTasks round-trips atomically", async () => {
    const tasks = await readTasks();
    await writeTasks(tasks);
    expect(await readTasks()).toEqual(tasks);
  });

  it("concurrent createTask calls do not lose updates", async () => {
    const before = (await readTasks()).length;
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        createTask(task({ id: `tsk_race_${i}`, summary: `Race ${i}` }))
      )
    );
    const after = await readTasks();
    for (let i = 0; i < 25; i++) {
      expect(after.some((t) => t.id === `tsk_race_${i}`)).toBe(true);
    }
    expect(after.length).toBe(before + 25);
  });
});
