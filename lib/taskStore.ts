import { promises as fs } from "node:fs";
import path from "node:path";
import { MC_CONFIG_DIR } from "./paths";
import type { DelegationTask, TaskState } from "./DelegationTask";

/**
 * Location of the delegation task store. Defaults to the shared Mission Control
 * config dir (same place as subagents.json / settings.json). Tests override via
 * `MC_TASKS_FILE`; resolved lazily so the env can be set after import.
 */
export function tasksFilePath(): string {
  return process.env.MC_TASKS_FILE || path.join(MC_CONFIG_DIR, "tasks.json");
}

export async function readTasks(): Promise<DelegationTask[]> {
  try {
    const data = await fs.readFile(tasksFilePath(), "utf8");
    return JSON.parse(data) as DelegationTask[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw e;
  }
}

/** Atomic write: temp file, then rename. */
export async function writeTasks(tasks: DelegationTask[]): Promise<void> {
  const file = tasksFilePath();
  const tempFile = file + ".tmp";
  await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2), "utf8");
  await fs.rename(tempFile, file);
}

/**
 * Serialize read-modify-write mutations. Every mutator (create/transition/
 * patch/updateRun/setReport) reads tasks.json, mutates the in-memory array,
 * then rewrites it — so two concurrent callers (the cron reconcile poller vs a
 * user's decide/dispatch, or two UI clicks) would otherwise clobber each
 * other's write and silently lose a task update. This promise-chain mutex
 * queues mutations in arrival order; a failure in one op never poisons the
 * queue. Reads stay lock-free (writes are atomic temp+rename).
 */
let writeQueue: Promise<void> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => {},
    () => {}
  );
  return run;
}

function nextId(): string {
  return `tsk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type NewTaskInput = Omit<Partial<DelegationTask>, "state"> & {
  summary: string;
  task: string;
  target: string;
  proposedBy?: "hermes" | "user";
  state?: TaskState;
};

/** Validate required contract fields. Throws on malformed input. */
export function assertValidTask(input: NewTaskInput): asserts input is NewTaskInput {
  if (!input.summary || !input.summary.trim()) throw new Error("task.summary is required");
  if (!input.task || !input.task.trim()) throw new Error("task.task is required");
  if (!input.target || !input.target.trim()) throw new Error("task.target is required");
  if (input.proposedBy && input.proposedBy !== "hermes" && input.proposedBy !== "user") {
    throw new Error(`task.proposedBy must be "hermes" or "user"`);
  }
}

export async function createTask(input: NewTaskInput): Promise<DelegationTask> {
  assertValidTask(input);
  const now = new Date().toISOString();
  const task: DelegationTask = {
    id: input.id ?? nextId(),
    summary: input.summary,
    task: input.task,
    target: input.target,
    proposedBy: input.proposedBy ?? "hermes",
    context: input.context,
    successCriteria: input.successCriteria,
    scope: input.scope ?? {},
    state: input.state ?? "proposed",
    acceptReason: input.acceptReason,
    declineReason: input.declineReason,
    run: input.run,
    report: input.report,
    parentTaskId: input.parentTaskId,
    accept_error: input.accept_error,
    run_error: input.run_error,
    scope_error: input.scope_error,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
  return withLock(async () => {
    const tasks = await readTasks();
    tasks.push(task);
    await writeTasks(tasks);
    return task;
  });
}

export async function getTask(id: string): Promise<DelegationTask | null> {
  const tasks = await readTasks();
  return tasks.find((t) => t.id === id) ?? null;
}

export async function listTasks(): Promise<DelegationTask[]> {
  const tasks = await readTasks();
  return tasks.sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1));
}

/** Legal state transitions per the design spec's state machine. */
const TRANSITIONS: Record<TaskState, TaskState[]> = {
  proposed: ["running", "declined"],
  running: ["done", "error"],
  declined: ["proposed"],
  done: [],
  error: ["proposed"],
};

/**
 * Validate + persist a state transition. `patch` merges extra real fields
 * (acceptReason, declineReason, accept_error, run_error, …) in the same write.
 */
export async function transitionTask(
  id: string,
  newState: TaskState,
  patch: Partial<DelegationTask> = {}
): Promise<DelegationTask> {
  return withLock(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    const allowed = TRANSITIONS[task.state];
    if (!allowed.includes(newState)) {
      throw new Error(`Invalid state transition: ${task.state} → ${newState}`);
    }
    task.state = newState;
    Object.assign(task, patch);
    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    return task;
  });
}

/** Merge real fields into a task WITHOUT a state transition (e.g. accept_error,
 *  scope_error, declineReason) and bump updatedAt. Persists atomically. */
export async function patchTask(
  id: string,
  patch: Partial<DelegationTask>
): Promise<DelegationTask> {
  return withLock(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    Object.assign(task, patch);
    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    return task;
  });
}

export async function updateRun(
  id: string,
  run: NonNullable<DelegationTask["run"]>
): Promise<DelegationTask> {
  return withLock(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.run = run;
    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    return task;
  });
}

export async function setReport(
  id: string,
  report: NonNullable<DelegationTask["report"]>
): Promise<DelegationTask> {
  return withLock(async () => {
    const tasks = await readTasks();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error(`Task ${id} not found`);
    task.report = report;
    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    return task;
  });
}
