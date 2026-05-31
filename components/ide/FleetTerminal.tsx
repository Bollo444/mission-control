"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SystemReport } from "@/lib/types";
import {
  COLORS,
  fmtBytes,
  fmtDuration,
  pctColor,
  relTime,
  stateColor,
} from "@/lib/format";

/* ------------------------------------------------------------------ *
 * A real, interactive terminal. On open it runs an actual system      *
 * check (GET /api/system) and prints the result in status colors;     *
 * then it accepts a small, safe built-in command set wired to the     *
 * live APIs (fleet status, launch/install agents, vault, meeting…).   *
 * ------------------------------------------------------------------ */

interface Seg {
  text: string;
  color?: string;
  dim?: boolean;
  bold?: boolean;
}
interface Row {
  id: number;
  segs: Seg[];
}

const s = (text: string, color?: string, opts: { dim?: boolean; bold?: boolean } = {}): Seg => ({
  text,
  color,
  ...opts,
});

let __rid = 0;
const nextId = () => ++__rid;

function bar(pct: number, width = 10): Seg[] {
  const filled = Math.round((pct / 100) * width);
  const col = pctColor(pct);
  return [
    s("█".repeat(filled), col),
    s("░".repeat(Math.max(0, width - filled)), undefined, { dim: true }),
  ];
}

function pad(str: string, n: number): string {
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

const COMMANDS = [
  ["help", "list available commands"],
  ["status", "run a live system check (alias: check, sys)"],
  ["fleet", "show every agent's live status (alias: agents)"],
  ["agent <id>", "detail one agent (e.g. agent claude)"],
  ["launch <id> [cwd]", "launch an agent in a new terminal"],
  ["install <id>", "run an agent's install command"],
  ["open <file>", "open a vault file in the editor"],
  ["vault", "show shared-memory vault health"],
  ["meeting", "open the team meeting boardroom"],
  ["sessions", "total sessions across the fleet"],
  ["neofetch", "host banner"],
  ["clear", "clear the screen (alias: cls)"],
  ["echo <text>", "print text"],
  ["time", "current time + host uptime"],
] as const;

// Surfaced only in OpenClaw's console (sysops mode). Assessments are real and
// read-only; destructive actions are PROPOSED (printed for you to run), never executed.
const SYSOPS_COMMANDS = [
  ["sysreport", "full machine-health report"],
  ["disk", "disk usage + free space"],
  ["mem", "memory usage"],
  ["temp", "propose a safe %TEMP% cleanup (review before running)"],
  ["uninstall <app>", "propose a winget uninstall command"],
  ["tune", "propose safe resource-tuning commands (read-only)"],
] as const;

export default function FleetTerminal({
  prompt = "mc",
  accent = "#46e0d0",
  onOpenFile,
  sysops = false,
}: {
  prompt?: string;
  accent?: string;
  onOpenFile?: (path: string) => void;
  sysops?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const lastReport = useRef<SystemReport | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const inputEl = useRef<HTMLInputElement>(null);

  const push = useCallback((...rs: Seg[][]) => {
    setRows((prev) => [...prev, ...rs.map((segs) => ({ id: nextId(), segs }))]);
  }, []);

  const echoCmd = useCallback(
    (cmd: string) => push([s(`${prompt} ❯ `, accent), s(cmd)]),
    [push, prompt, accent]
  );

  const printReport = useCallback(
    (r: SystemReport) => {
      lastReport.current = r;
      const { cpu, memory: mem, disk, vault, fleet, host } = r;
      push(
        [s("● HOST   ", COLORS.signal), s(`${host.type} ${host.release} · ${host.arch} · ${host.hostname}`)],
        [
          s("● UPTIME ", COLORS.signal),
          s(pad(fmtDuration(r.uptimeSec), 12)),
          s("NODE ", COLORS.signal),
          s(r.node, undefined, { dim: true }),
        ],
        [
          s("● CPU    ", COLORS.signal),
          s(pad(`${cpu.usagePct}%`, 5), pctColor(cpu.usagePct)),
          ...bar(cpu.usagePct),
          s(`  ${cpu.cores} cores @ ${cpu.speedMHz}MHz`, undefined, { dim: true }),
        ],
        [
          s("● MEM    ", COLORS.signal),
          s(pad(`${mem.usedPct}%`, 5), pctColor(mem.usedPct)),
          ...bar(mem.usedPct),
          s(`  ${fmtBytes(mem.usedBytes)} / ${fmtBytes(mem.totalBytes)}`, undefined, { dim: true }),
        ]
      );
      if (disk) {
        push([
          s("● DISK   ", COLORS.signal),
          s(pad(`${disk.usedPct}%`, 5), pctColor(disk.usedPct)),
          ...bar(disk.usedPct),
          s(`  ${fmtBytes(disk.usedBytes)} / ${fmtBytes(disk.totalBytes)} (${disk.drive})`, undefined, { dim: true }),
        ]);
      }
      push(
        [
          s("● VAULT  ", COLORS.signal),
          s(vault.exists ? "online" : "missing", vault.exists ? COLORS.ready : COLORS.offline),
          s(` · ${vault.agentNotes} notes · ${vault.activityEntries} activity · `, undefined, { dim: true }),
          s(vault.lastActivity ? `last ${relTime(vault.lastActivity)}` : "no activity yet", undefined, { dim: true }),
        ],
        [
          s("● FLEET  ", COLORS.signal),
          s(`${fleet.ready} ready`, COLORS.ready),
          s(" · ", undefined, { dim: true }),
          s(`${fleet.config} config`, COLORS.config),
          s(" · ", undefined, { dim: true }),
          s(`${fleet.offline} offline`, COLORS.offline),
          s(` · ${fleet.sessions} sessions`, undefined, { dim: true }),
        ]
      );
      for (const a of fleet.agents) {
        push([
          s(`   ${a.glyph} ${pad(a.name, 16)}`, a.accent),
          s(pad(a.state.toUpperCase(), 9), stateColor(a.state)),
          s(pad(a.version ? a.version.split(" ").slice(-1)[0] : "—", 12), undefined, { dim: true }),
          s(a.sessions > 0 ? `${a.sessions} session${a.sessions > 1 ? "s" : ""}` : "standby", a.accent),
        ]);
      }
    },
    [push]
  );

  const fetchReport = useCallback(async (): Promise<SystemReport | null> => {
    try {
      const res = await fetch("/api/system", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SystemReport;
    } catch (e) {
      push([s("✕ ", COLORS.crit), s(`system check failed: ${(e as Error).message}`, COLORS.crit)]);
      return null;
    }
  }, [push]);

  const runCheck = useCallback(async () => {
    setBusy(true);
    push([s("running system check…", undefined, { dim: true })]);
    const r = await fetchReport();
    if (r) {
      printReport(r);
      const health = r.fleet.offline > r.fleet.ready ? "degraded — most agents offline" : "nominal";
      push([
        s("✓ ", COLORS.ok),
        s("all systems "),
        s(health, health === "nominal" ? COLORS.ok : COLORS.warn),
        s(". type ", undefined, { dim: true }),
        s("help", accent),
        s(" for commands.", undefined, { dim: true }),
      ]);
    }
    setBusy(false);
  }, [fetchReport, printReport, push, accent]);

  // Initial boot: a real check, once.
  useEffect(() => {
    echoCmd("system --check");
    void runCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [rows, busy]);

  async function launch(action: "launch" | "install", id: string, cwd?: string) {
    try {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, cwd, action }),
      });
      const json = await res.json();
      push([s(json.ok ? "✓ " : "✕ ", json.ok ? COLORS.ok : COLORS.crit), s(json.message || "done", json.ok ? undefined : COLORS.crit)]);
    } catch (e) {
      push([s("✕ ", COLORS.crit), s((e as Error).message, COLORS.crit)]);
    }
  }

  const runCommand = useCallback(
    async (raw: string) => {
      const line = raw.trim();
      if (!line) {
        echoCmd("");
        return;
      }
      echoCmd(line);
      setHistory((h) => [...h, line]);
      setHistIdx(-1);
      const [cmd, ...args] = line.split(/\s+/);
      const arg = args.join(" ");

      const notFound = () =>
        push([
          s(`command not found: ${cmd}`, COLORS.crit),
          s("  — type ", undefined, { dim: true }),
          s("help", accent),
          s(".", undefined, { dim: true }),
        ]);
      const propose = (command: string, note: string) => {
        push([s("⚠ ", COLORS.warn), s("OpenClaw proposes — review, take a restore point, then run it yourself:", undefined, { dim: true })]);
        push([s("  $ ", undefined, { dim: true }), s(command, accent)]);
        push([s("    " + note, undefined, { dim: true })]);
      };

      switch (cmd.toLowerCase()) {
        case "help":
          push([s("Mission Control terminal — commands:", accent, { bold: true })]);
          for (const [name, desc] of COMMANDS) {
            push([s(`  ${pad(name, 20)}`, COLORS.signal), s(desc, undefined, { dim: true })]);
          }
          if (sysops) {
            push([s("system operations (OpenClaw — direct PC alteration):", accent, { bold: true })]);
            for (const [name, desc] of SYSOPS_COMMANDS) {
              push([s(`  ${pad(name, 20)}`, accent), s(desc, undefined, { dim: true })]);
            }
          }
          break;
        case "status":
        case "check":
        case "sys":
          await runCheck();
          break;
        case "fleet":
        case "agents": {
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r) {
            for (const a of r.fleet.agents) {
              push([
                s(`${a.glyph} ${pad(a.name, 16)}`, a.accent),
                s(pad(a.state.toUpperCase(), 9), stateColor(a.state)),
                s(a.sessions > 0 ? `${a.sessions} sessions` : "standby", undefined, { dim: true }),
              ]);
            }
          }
          setBusy(false);
          break;
        }
        case "agent": {
          if (!arg) {
            push([s("usage: agent <id>", COLORS.warn)]);
            break;
          }
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          const a = r?.fleet.agents.find((x) => x.id === arg.toLowerCase());
          if (!a) push([s(`unknown agent: ${arg}`, COLORS.crit)]);
          else {
            push(
              [s(`${a.glyph} ${a.name}`, a.accent, { bold: true }), s(`  [${a.state}]`, stateColor(a.state))],
              [s(`  version  `, undefined, { dim: true }), s(a.version || "—")],
              [s(`  sessions `, undefined, { dim: true }), s(String(a.sessions))]
            );
          }
          setBusy(false);
          break;
        }
        case "launch": {
          const [id, ...rest] = args;
          if (!id) {
            push([s("usage: launch <id> [working-dir]", COLORS.warn)]);
            break;
          }
          push([s(`launching ${id}…`, undefined, { dim: true })]);
          await launch("launch", id.toLowerCase(), rest.join(" ") || undefined);
          break;
        }
        case "install": {
          if (!arg) {
            push([s("usage: install <id>", COLORS.warn)]);
            break;
          }
          push([s(`installing ${arg}…`, undefined, { dim: true })]);
          await launch("install", arg.toLowerCase());
          break;
        }
        case "open": {
          if (!arg) {
            push([s("usage: open <vault-file>", COLORS.warn)]);
            break;
          }
          if (onOpenFile) {
            onOpenFile(arg);
            push([s("opening ", undefined, { dim: true }), s(arg, accent)]);
          } else {
            push([s("open is only available inside the IDE", COLORS.warn)]);
          }
          break;
        }
        case "vault": {
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r) {
            push(
              [s("vault ", accent, { bold: true }), s(r.vault.dir, undefined, { dim: true })],
              [
                s("  status   "),
                s(r.vault.exists ? "online" : "missing", r.vault.exists ? COLORS.ready : COLORS.offline),
              ],
              [s("  notes    "), s(String(r.vault.agentNotes))],
              [s("  activity "), s(`${r.vault.activityEntries} entries`)],
              [s("  last     "), s(r.vault.lastActivity ? relTime(r.vault.lastActivity) : "—")]
            );
          }
          setBusy(false);
          break;
        }
        case "meeting":
          push([s("opening the team meeting boardroom…", accent)]);
          router.push("/meeting");
          break;
        case "sessions": {
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r) push([s(`${r.fleet.sessions}`, accent, { bold: true }), s(" sessions across the fleet", undefined, { dim: true })]);
          setBusy(false);
          break;
        }
        case "neofetch": {
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r) {
            push(
              [s("    ◎   ", accent, { bold: true }), s(`${r.host.hostname}`, accent, { bold: true })],
              [s("   ╱│╲  ", accent), s(`${r.host.type} ${r.host.release} (${r.host.arch})`, undefined, { dim: true })],
              [s("    │   ", accent), s(`up ${fmtDuration(r.uptimeSec)} · node ${r.node}`, undefined, { dim: true })],
              [s("   ╱ ╲  ", accent), s(`${r.cpu.cores} cores · ${fmtBytes(r.memory.totalBytes)} RAM`, undefined, { dim: true })],
              [s("        "), s(`fleet ${r.fleet.ready}/${r.fleet.total} ready`, COLORS.ready)]
            );
          }
          setBusy(false);
          break;
        }
        case "time": {
          const r = lastReport.current;
          push([
            s(new Date().toLocaleString()),
            s(r ? `  · up ${fmtDuration(r.uptimeSec)}` : "", undefined, { dim: true }),
          ]);
          break;
        }
        case "echo":
          push([s(arg)]);
          break;
        case "clear":
        case "cls":
          setRows([]);
          break;

        // ---- system operations · OpenClaw console only (sysops) ----
        case "sysreport":
          if (!sysops) { notFound(); break; }
          await runCheck();
          break;
        case "disk": {
          if (!sysops) { notFound(); break; }
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r?.disk) {
            push(
              [s("disk ", accent, { bold: true }), s(r.disk.drive)],
              [s("  used  "), s(pad(`${r.disk.usedPct}%`, 5), pctColor(r.disk.usedPct)), ...bar(r.disk.usedPct)],
              [s("  free  "), s(fmtBytes(r.disk.freeBytes)), s(` / ${fmtBytes(r.disk.totalBytes)}`, undefined, { dim: true })]
            );
          } else push([s("disk info unavailable", COLORS.warn)]);
          setBusy(false);
          break;
        }
        case "mem": {
          if (!sysops) { notFound(); break; }
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r)
            push([
              s("memory ", accent, { bold: true }),
              s(pad(`${r.memory.usedPct}%`, 5), pctColor(r.memory.usedPct)),
              ...bar(r.memory.usedPct),
              s(`  ${fmtBytes(r.memory.usedBytes)} / ${fmtBytes(r.memory.totalBytes)}`, undefined, { dim: true }),
            ]);
          setBusy(false);
          break;
        }
        case "temp":
        case "clean":
          if (!sysops) { notFound(); break; }
          propose(
            'Remove-Item "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue',
            "clears your user TEMP folder; in-use files are skipped safely."
          );
          break;
        case "uninstall":
          if (!sysops) { notFound(); break; }
          if (!arg) { push([s("usage: uninstall <app name>", COLORS.warn)]); break; }
          propose(`winget uninstall "${arg}"`, "winget resolves the closest match — review before confirming.");
          break;
        case "tune":
        case "resources": {
          if (!sysops) { notFound(); break; }
          setBusy(true);
          const r = lastReport.current ?? (await fetchReport());
          if (r)
            push([
              s("resources ", accent, { bold: true }),
              s(`CPU ${r.cpu.usagePct}% · MEM ${r.memory.usedPct}% · ${r.cpu.cores} cores`, undefined, { dim: true }),
            ]);
          propose("Get-CimInstance Win32_StartupCommand | Select Name,Command,Location", "review startup apps (read-only).");
          propose("powercfg /list", "list power plans before switching (read-only).");
          setBusy(false);
          break;
        }

        default:
          notFound();
      }
    },
    [accent, echoCmd, fetchReport, onOpenFile, push, router, runCheck, sysops]
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !busy) {
      const v = input;
      setInput("");
      void runCommand(v);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(idx);
      setInput(history[idx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setRows([]);
    }
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden font-mono text-[12.5px] leading-relaxed"
      style={{ background: "#06080e" }}
      onClick={() => inputEl.current?.focus()}
    >
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {rows.map((r) => (
          <div key={r.id} className="whitespace-pre-wrap break-words">
            {r.segs.map((seg, i) => (
              <span
                key={i}
                style={{
                  color: seg.color ?? (seg.dim ? "#7b8294" : "#aab1c2"),
                  fontWeight: seg.bold ? 600 : 400,
                }}
              >
                {seg.text}
              </span>
            ))}
          </div>
        ))}
        {busy && (
          <div className="whitespace-pre">
            <span style={{ color: "#7b8294" }}>… working</span>
          </div>
        )}
      </div>
      {/* live input line */}
      <div className="flex shrink-0 items-center gap-2 px-4 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ color: accent }}>{prompt} ❯</span>
        <input
          ref={inputEl}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
          placeholder={busy ? "working…" : "type a command — try `help`"}
          className="min-w-0 flex-1 bg-transparent text-[#e8eaf0] outline-none placeholder:text-[#565d6e]"
          style={{ caretColor: accent }}
        />
      </div>
    </div>
  );
}
