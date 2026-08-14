/* ------------------------------------------------------------------ *
 * mc-vscode — origin proxy for the embedded VS Code web IDE.          *
 *                                                                      *
 * Fronts `code serve-web` (the official VS Code in the browser) on     *
 * its own port (:4320) so the IDE iframes cleanly, and bridges         *
 * /mc-api/* to Mission Control's API (:4317) with the admin token      *
 * injected server-side — so the Antigravity extension inside VS Code   *
 * can call vault/agents/repos/health endpoints same-origin, with no    *
 * CORS or cookie complications.                                        *
 *                                                                      *
 * Auth: the connection token for the IDE server itself is passed in    *
 * the iframe URL (?t=...) by the MC page; the proxy just forwards it.  *
 * WebSocket upgrades (the VS Code terminal / message bus) are          *
 * forwarded as-is.                                                     *
 * ------------------------------------------------------------------ */

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IDE_TARGET = process.env.VSCODE_TARGET || "http://127.0.0.1:4321";
const MC_TARGET = process.env.VSCODE_MC_TARGET || "http://127.0.0.1:4317";
const PORT = Number(process.env.VSCODE_PORT || 4320);
const TOKEN_FILE =
  process.env.MC_VSCODE_TOKEN_FILE ||
  path.join(os.homedir(), ".mission-control", "vscode-token");

const ide = new URL(IDE_TARGET);
const mc = new URL(MC_TARGET);

// The MC admin token: explicit env wins, else read from mission-control's
// .env.local so the proxy stays in sync with the app's own auth boundary.
function adminToken() {
  if (process.env.MC_ADMIN_TOKEN?.trim()) return process.env.MC_ADMIN_TOKEN.trim();
  try {
    const envFile = path.join(process.cwd(), ".env.local");
    const raw = fs.readFileSync(envFile, "utf8");
    const m = raw.match(/^MC_ADMIN_TOKEN\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* fall through */
  }
  return "";
}

// Ensure the token file exists (generate one if this is a first run) so the
// IDE server and the /api/vscode route agree on the connection secret.
function ensureTokenFile() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      const token =
        process.env.MC_VSCODE_TOKEN ||
        `mc-ide-${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
      fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
      fs.writeFileSync(TOKEN_FILE, token, "utf8");
      return token;
    }
    return fs.readFileSync(TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

const token = ensureTokenFile();

function forward(
  req,
  res,
  target,
  extraHeaders = {},
  pathOverride
) {
  const headers = { ...(req.headers ?? {}), ...extraHeaders };
  delete headers.host;
  delete headers["accept-encoding"]; // keep upstream uncompressed for streaming fidelity

  const upstream = http.request(
    {
      host: target.hostname,
      port: Number(target.port || 80),
      method: req.method,
      path: pathOverride ?? req.url ?? "/",
      headers,
    },
    (upRes) => {
      const out = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        const lk = k.toLowerCase();
        if (lk === "x-frame-options") continue; // the whole point: iframable
        if (lk === "content-security-policy") {
          // Strip frame-ancestors so VS Code's page can live in our iframe.
          out[k] = String(v).replace(/;\s*frame-ancestors[^;]*/i, "");
          continue;
        }
        out[k] = v;
      }
      res.writeHead(upRes.statusCode ?? 502, upRes.statusMessage ?? "", out);
      upRes.pipe(res);
    }
  );
  upstream.on("error", () => {
    try {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "VS Code IDE unreachable" }));
    } catch {
      /* socket already gone */
    }
  });
  // Node can route WebSocket-flavoured requests to the plain handler with a
  // stripped-down req object (no stream methods). Never crash the process over
  // one — forward headers and close, and the client reconnects.
  if (req && typeof req.pipe === "function") {
    req.pipe(upstream);
  } else {
    upstream.end();
  }
}

const server = http.createServer((req, res) => {
  try {
    const url = req.url ?? "/";

    // Bridge MC's API under /mc-api/* so the Antigravity extension (loaded by
    // the IDE from the same origin) can reach vault/agents/repos/health/etc.
    if (url === "/mc-api" || url.startsWith("/mc-api/")) {
      const apiPath = url.replace(/^\/mc-api/, "/api");
      const tok = adminToken();
      forward(req, res, mc, tok ? { authorization: `Bearer ${tok}` } : {}, apiPath);
      return;
    }

    forward(req, res, ide);
  } catch (e) {
    // A malformed request must never take the whole IDE down.
    try {
      res.writeHead(500);
      res.end();
    } catch {
      /* socket already gone */
    }
  }
});

// WebSocket upgrades (VS Code's terminal/message bus) → the IDE target.
server.on("upgrade", (req, socket, head) => {
  try {
    const headers = { ...(req.headers ?? {}) };
    delete headers.host;
    const up = net.connect(Number(ide.port || 80), ide.hostname, () => {
      up.write(
        `${req.method} ${req.url} HTTP/1.1\r\n` +
          Object.entries(headers)
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`)
            .join("") +
          "\r\n"
      );
      if (head && head.length) up.write(head);
    });
    up.on("error", () => socket.destroy());
    socket.on("error", () => up.destroy());
    up.pipe(socket);
    socket.pipe(up);
  } catch (e) {
    socket.destroy();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[mc-vscode] IDE ${IDE_TARGET} on http://127.0.0.1:${PORT} · /mc-api → ${MC_TARGET} · token ${token ? "present" : "MISSING"}`
  );
});
