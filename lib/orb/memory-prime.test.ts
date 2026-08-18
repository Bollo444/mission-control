import { describe, expect, test, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BOOT_FILE,
  INDEX_FILE,
  PRIORITIES_FILE,
  DAILY_DIR,
  DAILY_TEMPLATE,
  bootstrapMemoryVault,
  primeHermesContext,
  appendDailyNote,
  localDateStr,
} from "./memory-prime";

let tmpDirs: string[] = [];

function makeVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-prime-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  delete process.env.MC_MEMORY_PRIME;
  delete process.env.MC_DAILY_NOTE;
});

describe("memory vault bootstrap", () => {
  test("seeds the four files exactly once and never clobbers", () => {
    const vault = makeVault();
    const first = bootstrapMemoryVault(vault);
    expect(first.created.sort()).toEqual(
      [BOOT_FILE, INDEX_FILE, PRIORITIES_FILE, DAILY_TEMPLATE].sort(),
    );
    for (const rel of first.created) {
      expect(fs.existsSync(path.join(vault, rel))).toBe(true);
    }

    // Idempotent — a second run creates nothing new.
    const second = bootstrapMemoryVault(vault);
    expect(second.created).toEqual([]);

    // User edits survive a re-run.
    const bootPath = path.join(vault, BOOT_FILE);
    fs.writeFileSync(bootPath, "# my custom boot", "utf8");
    bootstrapMemoryVault(vault);
    expect(fs.readFileSync(bootPath, "utf8")).toBe("# my custom boot");
  });

  test("bakes the vault path into the boot config and index", () => {
    const vault = makeVault();
    bootstrapMemoryVault(vault);
    const boot = fs.readFileSync(path.join(vault, BOOT_FILE), "utf8");
    const index = fs.readFileSync(path.join(vault, INDEX_FILE), "utf8");
    expect(boot).toContain(vault);
    expect(index).toContain(vault);
  });
});

describe("priming", () => {
  test("assembles boot + index + priorities after bootstrap", () => {
    const vault = makeVault();
    bootstrapMemoryVault(vault);
    const primed = primeHermesContext(vault);
    expect(primed).toContain("Boot config");
    expect(primed).toContain("Vault index");
    expect(primed).toContain("Active priorities");
    expect(primed).toMatch(/Hermes/);
  });

  test("includes yesterday's daily note when it exists", () => {
    const vault = makeVault();
    bootstrapMemoryVault(vault);
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const note = `${DAILY_DIR}/${localDateStr(d)}.md`;
    fs.mkdirSync(path.join(vault, DAILY_DIR), { recursive: true });
    fs.writeFileSync(path.join(vault, note), "yesterday did a thing\n", "utf8");
    const primed = primeHermesContext(vault);
    expect(primed).toContain("yesterday did a thing");
  });

  test("returns empty when priming is disabled", () => {
    const vault = makeVault();
    bootstrapMemoryVault(vault);
    process.env.MC_MEMORY_PRIME = "0";
    expect(primeHermesContext(vault)).toBe("");
  });

  test("never throws on an empty or missing vault", () => {
    const vault = makeVault();
    expect(primeHermesContext(vault)).toBe("");
  });
});

describe("daily note checkpoint", () => {
  test("creates today's note from the template shape and appends sessions", () => {
    const vault = makeVault();
    const rel = appendDailyNote({ prompt: "fix the bug in X", vaultDir: vault });
    expect(rel).toBe(`${DAILY_DIR}/${localDateStr()}.md`);
    const body = fs.readFileSync(path.join(vault, rel!), "utf8");
    expect(body).toContain("## Index");
    expect(body).toContain("fix the bug in X");
    expect(body).toContain("## Session 1");

    appendDailyNote({ prompt: "deploy the fix", vaultDir: vault });
    const body2 = fs.readFileSync(path.join(vault, rel!), "utf8");
    expect(body2).toContain("## Session 2");
    expect(body2).toContain("deploy the fix");
  });

  test("is a no-op when daily notes are disabled", () => {
    const vault = makeVault();
    process.env.MC_DAILY_NOTE = "0";
    expect(appendDailyNote({ prompt: "x", vaultDir: vault })).toBeNull();
    expect(fs.existsSync(path.join(vault, DAILY_DIR))).toBe(false);
  });
});
