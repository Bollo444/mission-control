import { describe, expect, it } from "vitest";
import { parseSafeCommand } from "../lib/safe-command";

describe("automation command boundary", () => {
  it("allows real commands", () => {
    expect(parseSafeCommand("git status --short")).toEqual(["git", ["status", "--short"]]);
    expect(parseSafeCommand("node --version")).toEqual(["node", ["--version"]]);
    expect(parseSafeCommand("npm run build")).toEqual(["npm", ["run", "build"]]);
    expect(parseSafeCommand("node scripts/backup.js --dry-run")).toEqual(["node", ["scripts/backup.js", "--dry-run"]]);
  });

  it("rejects shell syntax", () => {
    expect(parseSafeCommand("git status && whoami")).toBeNull();
    expect(parseSafeCommand("git push; rm -rf /")).toBeNull();
    expect(parseSafeCommand("echo $(whoami)")).toBeNull();
    expect(parseSafeCommand("cat > /tmp/x")).toBeNull();
    expect(parseSafeCommand("ping 1.1.1.1 &\nwhoami")).toBeNull();
  });

  it("rejects shell and code-evaluator escapes", () => {
    expect(parseSafeCommand("bash -c echo-pwned")).toBeNull();
    expect(parseSafeCommand("cmd /c dir")).toBeNull();
    expect(parseSafeCommand("powershell -Command whoami")).toBeNull();
    expect(parseSafeCommand("node -e console.log(1)")).toBeNull();
    expect(parseSafeCommand("python -c print(1)")).toBeNull();
    expect(parseSafeCommand("perl -e system('rm -rf /')")).toBeNull();
  });
});
