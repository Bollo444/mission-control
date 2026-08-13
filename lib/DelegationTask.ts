export type TaskState =
  | "proposed"
  | "declined"
  | "running"
  | "done"
  | "error";

export interface DelegationTask {
  id: string;
  summary: string;
  task: string;
  target: string;
  proposedBy: "hermes" | "user";
  context?: string;
  successCriteria?: string;
  scope: {
    write?: boolean;
    vault?: boolean;
    gateway?: boolean;
    shell?: boolean;
  };
  state: TaskState;
  acceptReason?: string;
  declineReason?: string;
  run?: {
    id: string;
    status: "running" | "done" | "error";
    output?: string;
    exitCode?: number | null;
    startedAt: string;
    endedAt?: string;
  };
  report?: {
    text: string;
    generatedAt: string;
  };
  parentTaskId?: string;
  accept_error?: string;
  run_error?: string;
  scope_error?: string;
  createdAt: string;
  updatedAt: string;
}