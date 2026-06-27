# Build brief — MCP connector node for the Automation flow builder

**For:** Google Jules (autonomous coding agent)
**Repo:** `Bollo444/mission-control` (this repo) · branch off `main`
**Goal:** Add **one new flow-node type — `action.mcp`** — that lets a flow call a tool
on any connected **MCP server**. Each MCP server is a bundle of ready-made
connectors (GitHub, Notion, Supabase, web search, filesystem, …), so this single
node turns our existing ReactFlow builder into a Sim.ai-style connector hub
**without adopting Sim's platform** (no Postgres/Redis/auth). MCP is the open
standard Sim itself uses for "anything not built in"; we tap it directly.

---

## 0. Run & gate context (read before coding)

- Stack: **Next.js 15 (App Router) · React 19 · Tailwind v4 · TypeScript**, ReactFlow = `@xyflow/react`.
- Platform: **Windows on ARM (win32-arm64)**. Native modules must be added to
  `next.config.mjs` `serverExternalPackages`. The MCP SDK is pure JS (no native build),
  but it spawns child processes for stdio servers.
- **Local-first, no database.** All persistence is JSON under `~/.mission-control/`
  (see `lib/paths.ts` → `MC_CONFIG_DIR`). Follow that pattern; do **not** add a DB.
- Build: `npm run build`. Typecheck gate: `npx tsc --noEmit | grep -v '^tests/'`
  (pre-existing errors live only in `tests/` — ignore those).
- The app runs as a **prod PM2 build** on port 4317; **do not** start a second dev
  server on 4317. Use a different port if you must run it.
- Match existing code style (hairline-bordered panels, `var(--color-*)` tokens,
  `hexA()` from `lib/format.ts`).

## 1. Read these first (existing automation system)

- `lib/flows.ts` — the flow model (`FlowNode`, `FlowEdge`, `Flow`) + `runFlow()` executor
  (walks triggers → edges; each node's output threads downstream as the literal `{{input}}`).
  **You will add an `action.mcp` branch to the `walk()` switch here.**
- `components/automation/FlowBuilder.tsx` — the ReactFlow canvas. `PALETTE` defines node
  types + default data + the per-node inline editor (`FlowNodeView`). **You will add an
  `action.mcp` palette entry + its node editor.**
- `app/api/flows/route.ts`, `app/api/flows/run/route.ts`, `app/api/flows/generate/route.ts`
  — existing flow APIs (the generate route is the NL→flow driver; mirror its style).
- `lib/cron.ts` + `app/api/cron/route.ts` — reference for a JSON-store + API-route pattern.
- `lib/settings.ts` (`readSettings().apiKeys`) — how secrets are read (decrypted). MCP
  server env vars that are also fleet keys (e.g. `GITHUB_TOKEN`) can be sourced from here.

## 2. Tasks

### T1 — dependency
Add the official SDK: `npm i @modelcontextprotocol/sdk`. Add it to
`next.config.mjs` `serverExternalPackages` if Next tries to bundle it and fails.

### T2 — `lib/mcp.ts` (the MCP client manager, server-side only)
A small manager that connects to configured servers and exposes tools. Use the SDK:
- `Client` from `@modelcontextprotocol/sdk/client/index.js`
- `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` (for `transport: "stdio"`)
- `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`
  (for `transport: "http"`; fall back to `SSEClientTransport` from `.../client/sse.js` if the
  server is SSE-only).

Export:
- `listServers(): McpServerConfig[]` — from the JSON store (T3).
- `connect(id): Promise<Client>` — connect (and **cache** the live client per server id;
  reconnect on failure). 10s connect timeout; on stdio, pass `command`, `args`, and a merged
  `env` (process.env + config `env`, resolving any fleet keys via `readSettings().apiKeys`).
- `listTools(id): Promise<{name, description, inputSchema}[]>` — `client.listTools()`.
- `callTool(id, name, args): Promise<string>` — `client.callTool({name, arguments: args})`;
  flatten the `content[]` result to a string (text parts joined; JSON-stringify non-text).
  30s call timeout. Never throw out of `callTool` — return `⚠ <message>` on error.
- `closeAll()` for teardown.

### T3 — server config store + API
- Types:
  ```ts
  type McpTransport = "stdio" | "http";
  interface McpServerConfig {
    id: string; name: string; enabled: boolean;
    transport: McpTransport;
    // stdio:
    command?: string; args?: string[]; env?: Record<string,string>;
    // http:
    url?: string; headers?: Record<string,string>;
  }
  ```
- Store at `path.join(MC_CONFIG_DIR, "mcp.json")` (read/write JSON, like `lib/cron.ts`).
- Seed it on first read with the **default servers in §3** (all `enabled: false` — opt-in).
- `app/api/mcp/route.ts`:
  - `GET` → `{ servers: McpServerConfig[] }`, and for each **enabled** server also its tools
    (best-effort; if a server fails to connect, return it with `error` + empty tools, don't 500).
  - `POST` → add/update a server (body = `McpServerConfig`).
  - `DELETE ?id=` → remove a server.
  - `POST /api/mcp/test` (or `?action=test&id=`) → connect + list tools for one server, for the UI.
- Secrets: never return raw env/headers/token values to the client — redact them in GET.

### T4 — execute `action.mcp` in `lib/flows.ts`
In `runFlow`'s `walk()`, add:
```ts
} else if (node.type === "action.mcp") {
  const server = String(node.data.server || "");
  const tool   = String(node.data.tool || "");
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(subst(String(node.data.args || "{}"), input)); } catch {}
  const out = await callTool(server, tool, args);   // from lib/mcp.ts
  input = out;
  steps.push({ nodeId, type: node.type, ok: !out.startsWith("⚠"), detail: out.slice(0,400) });
}
```
(`subst` already replaces `{{input}}`; document that args is a JSON template, e.g.
`{"query":"{{input}}"}`.)

### T5 — FlowBuilder node (`components/automation/FlowBuilder.tsx`)
- Add to `PALETTE`:
  `{ type: "action.mcp", label: "⧉ MCP tool", color: "#9d8cff", defaults: { server: "", tool: "", args: "{}" } }`
- In `FlowNodeView`, render an editor for `action.mcp`: a **server** `<select>` and a **tool**
  `<select>` populated from `GET /api/mcp` (fetch once, cache in component state/context), plus
  an **args** textarea (JSON template, `{{input}}` supported). When the tool is picked, show its
  `description` and required params as a hint.
- Keep the existing floating-node + electric-edge styling (the node just works with it).

### T6 — MCP servers manager UI
Add a small manager so the user can enable/add servers and see their tools. Put it in the
**Automation** page — add a third tab next to "Flow builder" / "Cron & sub-agents" called
**"Connectors (MCP)"** (`app/automation/page.tsx` already has a `tab` state — extend it).
The manager lists servers from `/api/mcp` with: enable toggle, transport, tool count,
expandable tool list, a "Test" button, and an "Add server" form (name, transport, command/args
or url, env/headers key-values). Redact secrets in display.

### T7 — verify
- `npm run build` clean; `npx tsc --noEmit | grep -v '^tests/'` clean.
- Manually: enable the **filesystem** server (no key needed), then in the flow builder make
  `trigger.manual → action.mcp` (filesystem `list_directory` with `{"path":"."}`) → `action.log`,
  Save, Run, confirm the directory listing flows through. Add a screenshot/CLI transcript to the PR.

## 3. Default MCP servers to seed (the connector library)

Seed `mcp.json` with these (all `enabled:false`). Verify exact package names on npm — they
drift; prefer the ones under `modelcontextprotocol/servers` and official vendor packages.
**Stdio** servers launch via `npx -y <pkg>` (Node) or `uvx <pkg>` (Python — needs `uv` installed).

| id | name | transport | command / url | needs | notes |
|---|---|---|---|---|---|
| `filesystem` | Filesystem | stdio | `npx -y @modelcontextprotocol/server-filesystem <ALLOWED_DIR>` | — | start here; no key |
| `fetch` | Web fetch | stdio | `uvx mcp-server-fetch` | — | fetch/scrape a URL |
| `git` | Git | stdio | `uvx mcp-server-git` | — | repo ops on a local path |
| `memory` | Memory (KG) | stdio | `npx -y @modelcontextprotocol/server-memory` | — | scratch knowledge graph |
| `sequentialthinking` | Sequential thinking | stdio | `npx -y @modelcontextprotocol/server-sequential-thinking` | — | reasoning helper |
| `github` | GitHub | stdio | `npx -y @modelcontextprotocol/server-github` | `GITHUB_PERSONAL_ACCESS_TOKEN` (use fleet `GITHUB_TOKEN`) | repos, issues, PRs |
| `notion` | Notion | stdio | `npx -y @notionhq/notion-mcp-server` | `NOTION_TOKEN` | pages/databases |
| `supabase` | Supabase | stdio | `npx -y @supabase/mcp-server-supabase --access-token=<PAT>` | Supabase PAT | DB/SQL/edge fns |
| `postgres` | Postgres | stdio | `npx -y @modelcontextprotocol/server-postgres <CONN_STRING>` | conn string | raw SQL |
| `brave-search` | Web search (Brave) | stdio | `npx -y @modelcontextprotocol/server-brave-search` | `BRAVE_API_KEY` | or swap for Exa: `npx -y exa-mcp-server` + `EXA_API_KEY` |
| `slack` | Slack | stdio | `npx -y @modelcontextprotocol/server-slack` | `SLACK_BOT_TOKEN`, `SLACK_TEAM_ID` | post/read messages |
| `playwright` | Browser | stdio | `npx -y @playwright/mcp` | — | web automation (heavy) |

**Phase 2 / out of scope for now — OAuth servers** (Gmail, Google Calendar, Google Drive):
these need an OAuth flow + token storage that Mission Control doesn't have, and handling those
credentials touches a safety boundary. Leave them out of the initial seed; note them as "add
later once an OAuth/credential vault exists." Users who want them today can reach them through
a remote MCP endpoint that handles its own auth (configured as a `transport: "http"` server with
the provider's hosted MCP URL).

## 4. Constraints & safety (must hold)

- **Local-first, no DB.** JSON store only. No new long-running services beyond the MCP child
  processes the SDK spawns on demand.
- **Opt-in.** New servers default `enabled:false`; flows never auto-run (manual trigger only,
  same as today).
- **Secrets never reach the client.** Redact env/headers/tokens in all API responses.
- **Fail soft.** A dead/missing MCP server must not 500 the API or crash `runFlow` — surface
  `⚠ <reason>` and continue.
- **Timeouts** on connect (10s) and tool calls (30s); cache live clients; reconnect on drop.
- Don't pull in Sim or any platform — this is MCP-client only.

## 4b. Clarifications (answers to implementation questions)

1. **Windows/ARM vs a Linux dev env.** Develop on Linux freely — this is pure JS
   (`@modelcontextprotocol/sdk` + `child_process`), no native build, so ARM is a
   non-issue (the repo's only ARM gotcha is `node-pty`, untouched here). The real
   cross-platform trap is **stdio spawning**: on Windows `npx`/`uvx` are
   `npx.cmd`/`uvx.cmd`. Make spawning OS-aware in `lib/mcp.ts` — guard with
   `process.platform === "win32"` to use the `.cmd` form (or `cmd /c`), plain
   command elsewhere. Use `lib/paths.ts` / `os.homedir()` / `path.join`; never
   hardcode separators. Terminal/PTY specifics are unrelated to this task.
2. **Args template** = a **string parsed at execution** (not valid JSON until
   `{{input}}` is substituted). Add a **non-blocking** UI hint only: `JSON.parse`
   with `{{input}}`→dummy; on throw show a subtle "invalid JSON" warning but still
   allow Save. Executor already falls back to `{}` on parse failure.
3. **Secret redaction (GET /api/mcp):** keep key names, **mask values** —
   `{ GITHUB_TOKEN: "••••" }` for set values; never return real values. On POST,
   **only overwrite a secret when a non-empty value is supplied** (editing other
   fields must not wipe secrets; the form never pre-fills real secret values).
4. **Tool selection UI:** go **dynamic** — render each tool's `inputSchema`
   params (name · type · required · description) as hints under the args textarea
   (the schema is already in the GET payload). No full per-schema form for v1; a
   "prefill args skeleton" button (JSON template from the schema) is a nice bonus.
5. **Connection management:** cache live clients; on a tool-call failure from a
   dead transport, **evict + reconnect once and retry**, then return `⚠ …` to the
   flow (fail soft, no loops). 10s connect / 30s call timeouts.
6. **Default servers:** **seed all, `enabled:false`** — inert until enabled, so a
   missing `npx`/`uvx` is harmless. Enable/Test must surface a clear "command not
   found" error, and the UI should note which need `uv` (fetch/git/time) vs Node.

## 5. Deliverable
A PR to `main` with: `lib/mcp.ts`, `app/api/mcp/*`, the `action.mcp` execution in `lib/flows.ts`,
the FlowBuilder palette + node editor, the Connectors (MCP) manager tab, the seeded `mcp.json`
defaults, and a short README/CHANGELOG note. Include the verification transcript/screenshot.
