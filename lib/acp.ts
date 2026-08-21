import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { home } from "./paths";

/* ------------------------------------------------------------------ *
 * Minimal Agent Client Protocol (ACP) client for `hermes-acp`. ACP is  *
 * JSON-RPC 2.0 over stdio. We keep one long-lived agent process + one   *
 * session, send the user's prompt, and stream back the agent's message  *
 * chunks. Permission / fs requests are answered with safe defaults so   *
 * an orchestration turn never blocks waiting on the client. Everything  *
 * is time-boxed: if the agent isn't set up (no provider/model), callers *
 * get a clear message instead of a hang.                                *
 * ------------------------------------------------------------------ */

/**
 * Resolve the hermes-acp launcher. The Hermes Agent's install layout moved
 * over time: the current hermes-acp lives in the hermes-agent venv (v0.20+,
 * whose config carries the ≥64K-context model), while older installs left a
 * shim at ~/.local/bin/hermes-acp.exe. Prefer the current install, then the
 * legacy shim, then PATH — so the bridge always talks to the hermes-acp that
 * matches the agent's own config instead of a stale copy that errors out
 * ("Model auto ... below the minimum 64,000 required by Hermes Agent").
 */
const ACP_BIN =
  [
    home("AppData", "Local", "hermes", "hermes-agent", "venv", "Scripts", "hermes-acp.exe"),
    home(".local", "bin", "hermes-acp.exe"),
  ].find((p) => existsSync(p)) ?? "hermes-acp";

/**
 * Anthropic Constitutional AI Oath — injected as a system prompt so
 * every Hermes turn operates under these principles.
 */
const ANTHROPIC_OATH = `You are an AI assistant guided by the following principles:

1. Be helpful, harmless, and honest.
2. Do not help with illegal acts, violence, or harmful activities.
3. Respect intellectual property and copyright.
4. Protect user privacy and confidential information.
5. Do not deceive, mislead, or manipulate.
6. Acknowledge uncertainty and limits of knowledge.
7. Avoid bias and discrimination.
8. Do not generate sexual content involving minors.
9. Do not provide instructions for weapons, drugs, or self-harm.
10. When uncertain, err on the side of safety and transparency.

These principles guide all your responses and actions.`;

type Json = Record<string, unknown>;

interface Pending {
  resolve: (v: Json) => void;
  reject: (e: Error) => void;
}

interface Bridge {
  proc: ChildProcessWithoutNullStreams;
  nextId: number;
  pending: Map<number, Pending>;
  sessionId: string | null;
  initialized: boolean;
  /** Per-prompt sink for streamed agent_message_chunk text. */
  onChunk: ((text: string) => void) | null;
  buf: string;
  ready: Promise<void>;
}

let bridge: Bridge | null = null;

function send(b: Bridge, msg: Json) {
  b.proc.stdin.write(JSON.stringify(msg) + "\n");
}

function request(b: Bridge, method: string, params: Json, timeoutMs = 30_000): Promise<Json> {
  const id = b.nextId++;
  return new Promise<Json>((resolve, reject) => {
    const timer = setTimeout(() => {
      b.pending.delete(id);
      reject(new Error(`ACP ${method} timed out`));
    }, timeoutMs);
    b.pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    send(b, { jsonrpc: "2.0", id, method, params });
  });
}

function handleLine(b: Bridge, line: string) {
  let msg: Json;
  try {
    msg = JSON.parse(line) as Json;
  } catch {
    return;
  }

  // Response to one of our requests.
  if ("id" in msg && ("result" in msg || "error" in msg)) {
    const id = msg.id as number;
    const p = b.pending.get(id);
    if (!p) return;
    b.pending.delete(id);
    if ("error" in msg) p.reject(new Error(JSON.stringify(msg.error)));
    else p.resolve((msg.result ?? {}) as Json);
    return;
  }

  // Agent → client request (permission / fs). Answer with safe defaults.
  if ("id" in msg && "method" in msg) {
    const method = msg.method as string;
    const id = msg.id;
    if (method === "session/request_permission") {
      // Auto-allow once so an orchestration turn can proceed unattended.
      const params = (msg.params ?? {}) as Json;
      const options = ((params.options as Json[]) ?? []) as Json[];
      const allow =
        options.find((o) => String(o.kind ?? "").includes("allow")) ?? options[0];
      send(b, {
        jsonrpc: "2.0",
        id,
        result: { outcome: { outcome: "selected", optionId: allow?.optionId ?? "allow" } },
      });
    } else {
      // Unhandled client method — refuse cleanly so the agent moves on.
      send(b, { jsonrpc: "2.0", id, error: { code: -32601, message: "not supported" } });
    }
    return;
  }

  // Notifications (streaming updates).
  if ("method" in msg && msg.method === "session/update") {
    const params = (msg.params ?? {}) as Json;
    const update = (params.update ?? {}) as Json;
    if (update.sessionUpdate === "agent_message_chunk") {
      const content = (update.content ?? {}) as Json;
      if (content.type === "text" && typeof content.text === "string") {
        b.onChunk?.(content.text);
      }
    }
  }
}

function start(): Bridge {
  const proc = spawn(ACP_BIN, [], {
    cwd: home(),
    env: { ...process.env },
  });
  const b: Bridge = {
    proc,
    nextId: 1,
    pending: new Map(),
    sessionId: null,
    initialized: false,
    onChunk: null,
    buf: "",
    ready: Promise.resolve(),
  };

  proc.stdout.setEncoding("utf8");
  proc.stdout.on("data", (d: string) => {
    b.buf += d;
    let nl: number;
    while ((nl = b.buf.indexOf("\n")) >= 0) {
      const line = b.buf.slice(0, nl).trim();
      b.buf = b.buf.slice(nl + 1);
      if (line) handleLine(b, line);
    }
  });
  proc.on("exit", () => {
    for (const [, p] of b.pending) p.reject(new Error("ACP process exited"));
    b.pending.clear();
    if (bridge === b) bridge = null;
  });
  proc.on("error", () => {
    if (bridge === b) bridge = null;
  });

  b.ready = (async () => {
    const init = await request(b, "initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    }, 15_000);
    b.initialized = true;
    void init;
    const ns = await request(b, "session/new", { cwd: home(), mcpServers: [] }, 20_000);
    b.sessionId = (ns.sessionId as string) ?? null;
    if (!b.sessionId) throw new Error("no sessionId from agent");
  })();

  return b;
}

function ensureBridge(): Bridge {
  if (!bridge || bridge.proc.exitCode !== null) bridge = start();
  return bridge;
}

/**
 * Serializes prompts — Hermes' ACP server processes ONE prompt per session at
 * a time, and a concurrent second prompt is answered with "Queued for the next
 * turn. (N queued)" instead of actually running. Waiting in line here means
 * every orb turn really gets processed (in order), and the shared onChunk sink
 * can never be clobbered by an overlapping turn.
 */
let promptChain: Promise<unknown> = Promise.resolve();

/**
 * Send a prompt to Hermes and stream back the agent's text via onChunk.
 * Resolves when the turn ends. Throws (with a useful message) if the agent
 * isn't available or set up.
 */
export async function acpPrompt(
  text: string,
  onChunk: (t: string) => void
): Promise<{ stopReason: string }> {
  const run = async (): Promise<{ stopReason: string }> => {
    const b = ensureBridge();
    try {
      await b.ready;
    } catch (e) {
      bridge = null;
      throw new Error(
        `Hermes ACP isn't ready (${(e as Error).message}). Run \`hermes-acp --setup\` once to pick a provider/model.`
      );
    }
    if (!b.sessionId) throw new Error("Hermes ACP has no active session.");

    b.onChunk = onChunk;
    try {
      const res = await request(
        b,
        "session/prompt",
        {
          sessionId: b.sessionId,
          prompt: [
            { type: "text", text: ANTHROPIC_OATH },
            { type: "text", text },
          ],
        },
        // Agentic turns run a real tool loop through the free gateway — each
        // API call can take 10–30s, so give a delegated turn room to finish
        // instead of cutting it off mid-work. 180s bounds a runaway loop
        // while still allowing multi-step tasks to complete.
        180_000
      );
      return { stopReason: (res.stopReason as string) ?? "end_turn" };
    } finally {
      b.onChunk = null;
    }
  };

  const next = promptChain.then(run, run);
  // The chain keeps going even when a turn rejects (timeout / agent exit).
  promptChain = next.catch(() => {});
  return next;
}

export function acpAvailable(): boolean {
  try {
    // Lightweight existence check without spawning.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("node:fs").existsSync(ACP_BIN);
  } catch {
    return false;
  }
}
