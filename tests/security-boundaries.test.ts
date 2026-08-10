import { describe, expect, it } from "vitest";
import { parseSafeCommand } from "../lib/safe-command";

describe("automation command boundary", () => {
  it("allows only read-only diagnostics", () => {
    expect(parseSafeCommand("git status --short")).toEqual(["git", ["status", "--short"]]);
    expect(parseSafeCommand("node --version")).toEqual(["node", ["--version"]]);
  });

  it("rejects shell syntax and executable commands", () => {
    expect(parseSafeCommand("git status && whoami")).toBeNull();
    expect(parseSafeCommand("bash -c echo-pwned")).toBeNull();
    expect(parseSafeCommand("node -e alert(1)")).toBeNull();
    expect(parseSafeCommand("rm -rf /")).toBeNull();
  });
});
