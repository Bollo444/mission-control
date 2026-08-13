/* ------------------------------------------------------------------ *
 * fuel-power-plant — deepen OmniRoute's provider pool.                *
 *                                                                      *
 * OmniRoute's `auto` combo is built at runtime from connected          *
 * providers; with only OpenRouter connected, the combo exhausts on     *
 * rate limits. This adds the free-provider keys Mission Control        *
 * already holds (cerebras, groq, nvidia, mistral, github, google,      *
 * opencode) straight into provider_connections — the same plaintext    *
 * shape OmniRoute itself writes via the dashboard.                     *
 *                                                                      *
 * Run only with mc-omniroute STOPPED (WAL + in-memory caches).         *
 * ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Prefer the top-level copy — the nested dist copy can lose its native
// binding after an `npm i -g omniroute` update (missing build/Release/*.node).
const Database = require("C:/Users/Amari/AppData/Roaming/npm/node_modules/omniroute/node_modules/better-sqlite3");

const root = process.cwd();
const envRaw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const encMatch = envRaw.match(/^MC_ENCRYPTION_KEY=(.+)$/m);
if (!encMatch) {
  console.error("MC_ENCRYPTION_KEY not found in .env.local");
  process.exit(1);
}
const rawKey = encMatch[1].trim();
process.env.MC_ENCRYPTION_KEY = rawKey;

// Inline decrypt matching lib/secretbox.ts (AES-256-GCM, enc:v1:iv:tag:ct).
const masterKey = /^[0-9a-fA-F]{64}$/.test(rawKey) ? Buffer.from(rawKey, "hex") : crypto.createHash("sha256").update(rawKey).digest();
function decrypt(stored) {
  if (!stored || !stored.startsWith("enc:v1:")) return stored;
  const parts = stored.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, Buffer.from(parts[2], "base64"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64")), decipher.final()]).toString("utf8");
}

const settings = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".mission-control", "settings.json"), "utf8"));
const apiKeys = settings.apiKeys ?? {};

const want = {
  cerebras: { env: "CEREBRAS_API_KEY", name: "Cerebras" },
  groq: { env: "GROQ_API_KEY", name: "Groq" },
  nvidia: { env: "NVIDIA_API_KEY", name: "NVIDIA NIM" },
  mistral: { env: "MISTRAL_API_KEY", name: "Mistral" },
  github: { env: "GITHUB_TOKEN", name: "GitHub Models" },
  google: { env: "GEMINI_API_KEY", name: "Google Gemini" },
  opencode: { env: "OPENCODE_API_KEY", name: "OpenCode" },
};

const decrypted = {};
for (const [pid, cfg] of Object.entries(want)) {
  const stored = apiKeys[cfg.env];
  if (!stored) { console.log(`skip ${pid}: no ${cfg.env} in MC settings`); continue; }
  try {
    const key = decrypt(stored);
    if (!key || key === stored) { console.log(`skip ${pid}: decrypt failed`); continue; }
    decrypted[pid] = { ...cfg, key };
    console.log(`decrypted ${pid} (${cfg.env})`);
  } catch (e) {
    console.log(`skip ${pid}: ${e.message}`);
  }
}

if (!Object.keys(decrypted).length) { console.error("nothing to add"); process.exit(1); }

const dbPath = path.join(os.homedir(), ".omniroute", "storage.sqlite");
const db = new Database(dbPath);
// Idempotent: replace any existing connection for each target provider so a
// re-run refreshes keys (e.g. after rotating one in MC settings) instead of
// inserting duplicates. Only touches providers in `want` — OpenRouter etc. kept.
const del = db.prepare("DELETE FROM provider_connections WHERE provider = ?");
const insert = db.prepare(`
  INSERT INTO provider_connections
    (id, provider, auth_type, name, priority, is_active, api_key, proxy_enabled, test_status, created_at, updated_at)
  VALUES (@id, @provider, 'apikey', @name, 1, 1, @key, 1, 'active', @now, @now)
`);
const now = new Date().toISOString();
let upserted = 0;
for (const [pid, cfg] of Object.entries(decrypted)) {
  const existed = del.run(pid).changes;
  insert.run({ id: crypto.randomUUID(), provider: pid, name: cfg.name, key: cfg.key, now });
  upserted++;
  console.log(`${existed ? "~ refreshed" : "+ added"}: ${pid}`);
}
console.log(`upserted ${upserted} provider(s) — restart mc-omniroute to re-test keys`);
db.close();
