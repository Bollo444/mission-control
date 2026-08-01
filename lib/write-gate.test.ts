import { describe, it, expect } from "vitest";
import {
  checkWritePermission,
  checkShellPermission,
  isProtectedTarget,
  WRITE_TRUSTED_AGENT,
} from "./write-gate";
import path from "node:path";
import { REPO_ROOT } from "./paths";

const R = REPO_ROOT;

describe("write-gate: surface protection", () => {
  it("recognizes protected source dirs", () => {
    expect(isProtectedTarget(path.join(R, "lib", "registry.ts"))).toBe(true);
    expect(isProtectedTarget(path.join(R, "app", "api", "agent-note", "route.ts"))).toBe(true);
    expect(isProtectedTarget(path.join(R, "components", "Shell.tsx"))).toBe(true);
    expect(isProtectedTarget(path.join(R, "next.config.mjs"))).toBe(true);
  });
  it("does not flag vault activity / patches as protected", () => {
    expect(isProtectedTarget(path.join(R, "MissionControlVault", "Activity", "Activity Log.md"))).toBe(false);
    expect(isProtectedTarget(path.join(R, "MissionControlVault", "Agents", "Cline.md"))).toBe(false);
    expect(isProtectedTarget(path.join(R, "patches", "cline", "fix.diff"))).toBe(false);
  });
  it("does not flag outside-repo paths", () => {
    expect(isProtectedTarget("/tmp/somewhere/lib/foo.ts")).toBe(false);
  });
});

describe("write-gate: caller permission", () => {
  it("Sentinel can write anything", () => {
    const c = checkWritePermission({
      callerAgentId: WRITE_TRUSTED_AGENT,
      target: path.join(R, "lib", "registry.ts"),
      kind: "file.write",
    });
    expect(c.ok).toBe(true);
  });
  it("non-Sentinel cannot write lib/", () => {
    const c = checkWritePermission({
      callerAgentId: "cline",
      target: path.join(R, "lib", "registry.ts"),
      kind: "file.write",
    });
    expect(c.ok).toBe(false);
    expect(c.requiredAgent).toBe("sentinel");
  });
  it("non-Sentinel cannot write app/", () => {
    const c = checkWritePermission({
      callerAgentId: "vibe",
      target: path.join(R, "app", "page.tsx"),
      kind: "file.write",
    });
    expect(c.ok).toBe(false);
  });
  it("non-Sentinel CAN write vault Activity Log (append)", () => {
    const c = checkWritePermission({
      callerAgentId: "cline",
      target: path.join(R, "MissionControlVault", "Activity", "Activity Log.md"),
      kind: "file.write",
    });
    expect(c.ok).toBe(true);
  });
  it("non-Sentinel CAN write to patches/ (proposal stage)", () => {
    const c = checkWritePermission({
      callerAgentId: "hermes",
      target: path.join(R, "patches", "hermes", "fix.diff"),
      kind: "file.write",
    });
    expect(c.ok).toBe(true);
  });
  it("own-agent-note carve-out works", () => {
    const c = checkWritePermission({
      callerAgentId: "cline",
      target: path.join(R, "MissionControlVault", "Agents", "Cline.md"),
      kind: "file.write",
      ownAgentNote: true,
    });
    expect(c.ok).toBe(true);
  });
  it("outside-repo is unconstrained", () => {
    const c = checkWritePermission({
      callerAgentId: "hermes",
      target: "/tmp/worktree/foo.ts",
      kind: "file.write",
    });
    expect(c.ok).toBe(true);
  });
});

describe("write-gate: shell permission", () => {
  it("Sentinel can run shell anywhere", () => {
    const c = checkShellPermission({ callerAgentId: WRITE_TRUSTED_AGENT, command: "npm test" });
    expect(c.ok).toBe(true);
  });
  it("non-Sentinel cannot run shell inside lib/", () => {
    const c = checkShellPermission({
      callerAgentId: "cline",
      command: "ls",
      cwd: path.join(R, "lib"),
    });
    expect(c.ok).toBe(false);
    expect(c.requiredAgent).toBe("sentinel");
  });
  it("non-Sentinel can run shell in workspace", () => {
    const c = checkShellPermission({
      callerAgentId: "cline",
      command: "ls",
      cwd: path.join(R, "MissionControlVault"),
    });
    expect(c.ok).toBe(true);
  });
});
