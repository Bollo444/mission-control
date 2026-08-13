/* ------------------------------------------------------------------ *
 * mc-power-plant — origin-for-origin reverse proxy for the Power Plant *
 * (OmniRoute at :20128), served on its own port (:4318).              *
 *                                                                      *
 * OmniRoute's dashboard blocks direct iframing (X-Frame-Options: DENY  *
 * + CSP frame-ancestors 'none'), and its Next.js app reconstructs      *
 * root-absolute URLs at runtime — so path-prefix proxying (as done     *
 * through /api/omniroute/*) can't work reliably. Serving it on its own *
 * origin means the app runs unmodified: every /_next, /api, /dashboard *
 * path hits this proxy and is forwarded as-is to OmniRoute. WebSocket   *
 * upgrades (/live) are forwarded too, so live panels keep updating.    *
 *                                                                      *
 * Auth: loopback-only. The dashboard's own login wall still applies;   *
 * the browser's localhost cookies (host-scoped, port-agnostic) flow    *
 * through automatically.                                               *
 * ------------------------------------------------------------------ */

import http from "node:http";
import net from "node:net";

const TARGET = process.env.POWER_PLANT_TARGET || "http://127.0.0.1:20128";
const PORT = Number(process.env.POWER_PLANT_PORT || 4318);
const target = new URL(TARGET);

const server = http.createServer((req, res) => {
  const path = req.url ?? "/";
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["accept-encoding"]; // keep upstream uncompressed for streaming fidelity

  const upstream = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      method: req.method,
      path,
      headers,
    },
    (upRes) => {
      // Pass through everything except the frame blockers.
      const out = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        const lk = k.toLowerCase();
        if (lk === "x-frame-options") continue;
        if (lk === "content-security-policy") {
          const cleaned = String(v).replace(/;\s*frame-ancestors[^;]*/i, "");
          out[k] = cleaned;
          continue;
        }
        out[k] = v;
      }
      res.writeHead(upRes.statusCode ?? 502, upRes.statusMessage ?? "", out);
      upRes.pipe(res);
    }
  );
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Power Plant unreachable" }));
  });
  req.pipe(upstream);
});

// WebSocket upgrades (OmniRoute's /live feed) → forward to the same origin.
server.on("upgrade", (req, socket, head) => {
  const path = req.url ?? "/";
  const headers = { ...req.headers };
  delete headers.host;
  const up = net.connect(Number(target.port || 80), target.hostname, () => {
    up.write(
      `${req.method} ${path} HTTP/1.1\r\n` +
        Object.entries(headers)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}\r\n`)
          .join("") +
        "\r\n"
    );
    if (head && head.length) up.write(head);
  });
  up.on("connect", () => {});
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
  up.pipe(socket);
  socket.pipe(up);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mc-power-plant] proxying ${TARGET} on http://127.0.0.1:${PORT}`);
});
