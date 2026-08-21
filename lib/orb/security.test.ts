import { describe, expect, test } from "vitest";
import { isDestructive, operatorGateBlocked, operatorGateMessage } from "./security";

describe("orb operator security gate", () => {
  test("flags destructive operations", () => {
    expect(isDestructive("rm -rf node_modules")).toBe(true);
    expect(isDestructive("rm -r tmp")).toBe(true);
    expect(isDestructive("git push origin main")).toBe(true);
    expect(isDestructive("git push --force")).toBe(true);
    expect(isDestructive("git reset --hard HEAD~1")).toBe(true);
    expect(isDestructive("drop database prod")).toBe(true);
    expect(isDestructive("shutdown -s")).toBe(true);
    expect(isDestructive("deploy the new build")).toBe(true);
    expect(isDestructive("Remove-Item -Recurse C:\\old")).toBe(true);
  });

  test("does not flag harmless asks", () => {
    expect(isDestructive("what time is it")).toBe(false);
    expect(isDestructive("explain how rm works")).toBe(false);
    expect(isDestructive("list my git branches")).toBe(false);
    expect(isDestructive("what is a database")).toBe(false);
  });

  test("gate is inert when no passphrase is configured", () => {
    expect(operatorGateBlocked("rm -rf /tmp/x", "")).toBe(false);
    expect(operatorGateBlocked("rm -rf /tmp/x", "   ")).toBe(false);
  });

  test("a destructive command is blocked without the passphrase", () => {
    expect(operatorGateBlocked("rm -rf /tmp/x", "the secret")).toBe(true);
    expect(operatorGateBlocked("git push origin main", "the secret")).toBe(true);
  });

  test("the passphrase inline lets a destructive command through", () => {
    expect(operatorGateBlocked("rm -rf /tmp/x the secret", "the secret")).toBe(false);
    expect(operatorGateBlocked("deploy to prod — the secret", "the secret")).toBe(false);
  });

  test("the refusal message tells the user what to do", () => {
    expect(operatorGateMessage()).toMatch(/passphrase/i);
    expect(operatorGateMessage()).toMatch(/destructive/i);
  });
});
