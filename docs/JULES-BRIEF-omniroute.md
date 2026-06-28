# Build brief — adopt OmniRoute as the primary "Fleet Gateway"

**For:** Google Jules (autonomous coding agent)
**Repo:** `Bollo444/mission-control` (this repo) · branch off `main`
**Goal:** Make **OmniRoute** ([github.com/diegosouzapw/OmniRoute](https://github.com/diegosouzapw/OmniRoute)
— MIT, a local AI gateway/router that runs as an OpenAI-compatible proxy on
`http://localhost:20128/v1`; ~231 providers, 50+ free, 17 routing strategies,
token compression (RTK + Caveman), auto-fallback, and a built-in MCP server) the
**PRIMARY** router for Mission Control, surfaced in the UI as the **"Fleet
Gateway."** The existing in-app multi-provider cascade (`lib/gateway.ts`) is
**renamed the "Backup Generator"** and becomes an automatic, health-based
fallback that energizes only when OmniRoute is unreachable. Think power grid:
the **Fleet Gateway** is mains power; the **Backup Generator** is the standby
generator that kicks in on an outage and idles the rest of the time.

This is an integration, not a rewrite. OmniRoute runs as an **external local
service** — exactly like the Cloudflare tunnel we already keep alive under PM2 —
and Mission Control gains a tab to drive it plus a failover path in front of it.

---

## 0. Run & gate context (read before coding)

- Stack: **Next.js 15 (App Router) · React 19 · Tailwind v4 · TypeScript**.
- Platform: **Windows on ARM (win32-arm64)**. The app runs as a **prod PM2 build
  on port 4317** (`pm2 start "npm run start" --name mission-control`); **do not**
  start a second dev server on 4317 — use another port if you must run one.
- OmniRoute is a **separate Node/Bun service** that listens on **`localhost:20128`**
  and persists to its **own SQLite DB**. It is started/kept-alive by PM2, the same
  way the tunnel is (see README → "Deployment (always-on)").
- **Local-first, no MC database.** All Mission Control persistence is JSON under
  `~/.mission-control/` (see `lib/paths.ts` → `MC_CONFIG_DIR`). Do **not** add a DB
  to MC. OmniRoute's SQLite is OmniRoute's business and stays inside its own dir.
- Build: `npm run build`. Typecheck gate: `npx tsc --noEmit | grep -v '^tests/'`
  (pre-existing errors live only in `tests/` — ignore those).
- Match existing code style: hairline-bordered `mc-panel` panels, `var(--color-*)`
  tokens, `hexA()` from `lib/format.ts`, the gold/dark theme.
- **Phase 0 is a spike, not MC code.** Prove OmniRoute runs and its free providers
  actually answer **before** touching this repo (see §6).

## 1. Read these first (what you are wrapping / renaming)

- `lib/gateway.ts` — **this is the "Backup Generator."** `cascadeChat(body, opts)`
  is the multi-provider cascade (primary → `AUTO` list → cooldown/budget-aware
  fallback); `gatewayModels()` is the catalog. **You are not deleting this — you
  are demoting it to standby and calling it only when OmniRoute fails.**
- `app/api/gateway/[...path]/route.ts` — the OpenAI-compatible endpoint at
  `/api/gateway/v1` (chat/completions, responses, models). Today it calls
  `cascadeChat` directly. **This is the single choke point where failover is
  wired: try OmniRoute first, fall back to `cascadeChat` on failure.**
- `app/gateway/page.tsx` — the current **"Gateway Analytics"** page (per-provider
  volume / success / latency / tokens from `/api/analytics`). Its content gets
  **folded into the new Fleet Gateway tab** as the "Backup Generator" telemetry.
- `components/Shell.tsx` — the left sidebar nav (`NavLink` list). The current
  `/gateway` link lives here; you add/replace it with the **Fleet Gateway** tab.
- `components/orb/petals.tsx` — the orb's compass menu ("Jarvis orb tab"). The
  `gateway` petal at `angle: 45` embeds `app/gateway/page.tsx`. **This is the
  "like the Jarvis orb tab" reference** — the new Fleet Gateway surface should be
  reachable both as a sidebar nav link AND as this orb petal, the same way every
  other fleet page is.
- `app/settings/page.tsx` — the **Settings · Routing** page. Two regions get
  slimmed (§5): the **"Per-agent model routing"** table (lines ~102–156) and the
  **"Free-tier limits & live status"** panel (lines ~158–211).
- `lib/settings.ts` — `readSettings()` / `writeSettings()` and the `PROVIDERS`
  catalog. `apiKeys` are **decrypted on read / encrypted on write** via
  `lib/secretbox.ts` when `MC_ENCRYPTION_KEY` is set. `routingPreferred` is the
  per-agent default the backup cascade reads.
- `lib/paths.ts` — `MC_CONFIG_DIR = ~/.mission-control`. New JSON config goes here.
- README → "Deployment (always-on)" and `tunnel-watchdog.ps1` — the existing
  **PM2 + watchdog** pattern to mirror for the OmniRoute process.

## 2. Architecture & rename map

| Role | Power-grid term | What it is | Lives where |
|---|---|---|---|
| **Primary router** | Fleet Gateway (mains) | OmniRoute proxy on `:20128/v1` | external PM2 service |
| **Standby fallback** | Backup Generator (genset) | `cascadeChat` in `lib/gateway.ts` | inside the MC `next start` process |
| **Choke point** | the transfer switch | `app/api/gateway/[...path]/route.ts` | MC API route |

The dataflow after this work:

```
agent / tool  ──► MC endpoint /api/gateway/v1   (the transfer switch)
                       │
                       ├─ 1. probe + forward to OmniRoute  http://localhost:20128/v1
                       │        ok ──────────────────────────────────► response
                       │        unreachable / 5xx / (opt) 429
                       ▼
                       └─ 2. fall back to cascadeChat()  ── the Backup Generator
```

**Rename rules (do these literally so the UI reads consistently):**
- Everywhere the UI says "Gateway" / "Fleet Gateway" meaning the in-app cascade,
  re-label the in-app cascade as **"Backup Generator."**
- The name **"Fleet Gateway"** now belongs to **OmniRoute** (the primary).
- Keep code identifiers in `lib/gateway.ts` as-is to minimize churn (no mass
  rename of `cascadeChat`); the rebrand is **UI-facing copy**, plus a short header
  comment in `lib/gateway.ts` noting it is now the Backup Generator. Where a new
  symbol is needed, name it for the new role (e.g. `lib/omniroute.ts`).

## 3. Tasks

### T1 — OmniRoute process under PM2 (the mains supply)
- Treat OmniRoute like the tunnel: a long-lived local service PM2 owns.
- Add a documented PM2 line (README "Deployment" section) to start OmniRoute,
  e.g. `pm2 start <omniroute-entry> --name mc-omniroute` (exact entry/command
  determined in Phase 0), then `pm2 save`.
- Optionally extend the watchdog pattern (`tunnel-watchdog.ps1`) so OmniRoute is
  restarted if it dies. Keep it OS-aware (win32-arm64).
- **Do not** vendor OmniRoute's source into this repo. Clone/install it alongside
  (a sibling dir or its documented install), and reference it from PM2 + docs.

### T2 — `lib/omniroute.ts` (client + health probe, server-side only)
A small module that talks to OmniRoute and reports liveness. Export:
- `OMNIROUTE_BASE` — default `http://localhost:20128/v1`, overridable via env
  `OMNIROUTE_BASE_URL` (mirror how `local` provider reads `LOCAL_BASE_URL`).
- `probe(): Promise<{ up: boolean; latencyMs: number; detail?: string }>` —
  a cheap `GET /models` (or OmniRoute's health route) with a **short timeout
  (~2s)** and an in-memory cache (e.g. 5s TTL) so the status indicator and the
  failover path don't hammer it. Never throws.
- `forwardChat(body, headers): Promise<Response | null>` — POST to
  `${OMNIROUTE_BASE}/chat/completions` (and `/responses` if OmniRoute supports
  it; otherwise translate). Returns the upstream `Response` on success, or
  **`null` on a failover trigger** (unreachable / timeout / 5xx — see §4). Pass
  through streaming bodies untouched, same as the current route does.
- `omnirouteModels(): Promise<{id, owned_by}[]>` — proxy OmniRoute's `/models`
  for the analytics/catalog view (best-effort; empty on failure).
- Reuse the existing 60s call timeout / AbortController shape from `lib/gateway.ts`.

### T3 — Failover in `app/api/gateway/[...path]/route.ts` (the transfer switch)
- Before calling `cascadeChat`, call `forwardChat(...)`.
  - **If it returns a usable Response → serve it** (set `X-MC-Served-By:
    omniroute` / pass through OmniRoute's own served-by header if present).
  - **If it returns `null` (failover trigger) → fall back to `cascadeChat`**
    exactly as today, and tag the response (`X-MC-Served-By: backup/<provider>/<model>`,
    plus an `X-MC-Failover: 1` header) so the UI can show the generator ran.
- Preserve all existing behavior on the backup path: token accounting
  (`recordTokens`), streaming tail scan, the Responses→chat bridge, auth via
  `getGatewayToken()`. **Auth stays at the MC edge** — clients keep using the MC
  gateway token; they never see OmniRoute directly.
- `logEvent` each failover (`source: "gateway"`, level `warn`) so it shows in Logs.

### T4 — Failover policy (`lib/omniroute.ts`)
Decide and document the **failover triggers** (keep it conservative — the backup
is a safety net, not a load balancer):
- **Always fail over:** connection refused / DNS / timeout (OmniRoute down), and
  any **5xx** from OmniRoute itself (its own crash, not an upstream provider's).
- **Do NOT fail over by default:** OmniRoute already does cross-provider fallback
  internally, so a normal 4xx (bad request) is the caller's bug — pass it through.
- **Optional (config flag, default off):** treat a sustained **429** from
  OmniRoute as a trigger. Off by default because OmniRoute's own rate-limit
  handling should win first; expose it as a setting so it can be turned on if
  OmniRoute starts returning 429s it can't recover from.
- Add a tiny **circuit-breaker / cooldown** (reuse the `cooldownUntil` idea from
  `lib/gateway.ts`): after N consecutive OmniRoute failures, skip the probe and
  go straight to the Backup Generator for a short window, then re-test. Avoids
  paying the probe timeout on every request during an outage.

### T5 — The "Fleet Gateway" tab (the control room)
Add a new surface reachable two ways, like every other fleet page:
1. **Sidebar nav** (`components/Shell.tsx`): replace the `/gateway` `NavLink`
   ("⇄ Gateway") with **"⇄ Fleet Gateway"** pointing at the new route
   (keep `/gateway` or add `/fleet-gateway` — your call, but update both nav
   spots and the petal).
2. **Orb petal** (`components/orb/petals.tsx`): the `gateway` petal (angle 45)
   embeds the new page, same `dynamic(() => import(...))` pattern as today.

**Page contents (top → bottom):**
- **Live status banner** — the headline of the whole feature:
  `Fleet Gateway ● online · Backup Generator ○ standby`
  driven by a new `GET /api/omniroute/status` (returns `probe()` + whether the
  backup is currently the active path / last failover time). Green dot when
  OmniRoute is up; amber "Backup Generator ● ACTIVE" when failover is engaged.
  Poll it on the existing `useFetch(url, ms)` cadence (~5s).
- **OmniRoute's own UI, embedded via `<iframe src="http://localhost:20128">`** —
  this is the primary control panel (its 231 providers, 17 strategies, token
  compression, etc.). See the aesthetic tradeoff below.
- **Backup Generator telemetry** — fold in the current `app/gateway/page.tsx`
  content (the `/api/analytics` per-provider volume/success/latency/tokens table
  + window switcher), re-labelled as the standby generator's history so you can
  see what it served during outages.

**Aesthetic tradeoff (call it out in the PR, recommend iframe-first):**
- **Option A — iframe (recommended for v1):** fast to ship, always in sync with
  OmniRoute's real features. Downside: it **won't match MC's gold/dark theme** —
  it's OmniRoute's own skin in a frame. Mitigate with a framed `mc-panel`
  container, a clear "OmniRoute control panel" caption, and (optional) a tiny
  injected stylesheet if OmniRoute allows it.
- **Option B — native MC-skinned panel** talking to OmniRoute's REST API: fully
  on-theme, but materially more work and it must chase OmniRoute's API as it
  changes. **Recommendation: ship the iframe now, skin natively later** once the
  primary→backup model is proven and OmniRoute's API surface has stabilized.

### T6 — Slim down Settings · Routing (§ detail below)
See §5. Net effect: per-agent routing + the free-tier panel leave Settings
(routing now lives in OmniRoute), but a **minimal Backup Generator config stays**
because the generator still needs to know what to cascade to.

## 4. Keys & secrets (avoid duplicating the vault)

- Mission Control reads keys from **`~/.mission-control/settings.json`**, decrypted
  on read via `lib/secretbox.ts` (**encrypted at rest when `MC_ENCRYPTION_KEY` is
  set in `.env.local`** — it already is in this deployment). The browser only ever
  receives `configured` booleans (`publicSettings`), never raw key values.
- OmniRoute keeps **its own provider keys in its SQLite DB**, entered through
  OmniRoute's own UI (the embedded iframe). That is where the 231 providers are
  configured.
- **Decision — single source of truth per role, no syncing secrets across stores:**
  - **OmniRoute (primary)** owns the keys for the broad provider set, in its DB,
    managed in OmniRoute's UI. MC does **not** push MC's keys into OmniRoute.
  - **MC `settings.json` (backup)** keeps only the handful of keys the **Backup
    Generator** cascade actually uses (the free providers in `lib/gateway.ts`'s
    `CHAT`/`AUTO`). These already exist in MC.
  - This means a key for a provider used by *both* paths is entered twice (once in
    OmniRoute, once in MC) — **accepted on purpose**: it keeps each engine
    self-contained, avoids building a secret-sync bridge, and means the backup
    still works even if OmniRoute's DB is wiped. Document this clearly in the UI
    ("Backup Generator keys are configured separately, in Settings · Routing").
  - **Do not** export MC's decrypted keys to disk or to OmniRoute programmatically.
- Note for the PR/README: since OmniRoute is a proxy that **holds API keys for up
  to 231 providers in one place**, it is a high-value secret store — see §7.

## 5. Slimming Settings · Routing (`app/settings/page.tsx`)

**Remove (routing now lives in OmniRoute's UI):**
- The **"Per-agent model routing"** table (the per-agent provider/model `Select`
  rows, ~lines 102–156). Routing strategy is OmniRoute's job now.
- The **"Free-tier limits & live status"** panel at the bottom (the
  `FREE_LIMITS` / health-status list, ~lines 158–211). OmniRoute surfaces its own
  provider status; the MC health monitor for the big provider matrix is redundant
  for the primary path.

**Keep — a MINIMAL "Backup Generator" config** (the generator still needs fuel):
- A compact section titled **"Backup Generator"** explaining it is the standby
  fallback used only when the Fleet Gateway (OmniRoute) is down.
- **Provider API keys** for the backup cascade's providers (the existing
  `apiKeys` editor — keep it, it already redacts/encrypts). These feed
  `cascadeChat`.
- An **"auto" fallback list** — the order the generator cascades through. This is
  `lib/gateway.ts`'s `AUTO` array today (hard-coded). Either leave it hard-coded
  and just show it read-only ("backup cascade order"), or lift it into
  `settings.json` as an editable list. **Recommended v1: show it read-only** (less
  surface area; YAGNI) and note it's editable later.
- Keep the existing **"Fleet Gateway" connection card** (Base URL + token) but
  update its copy: the base URL is still the MC endpoint
  `http://127.0.0.1:4317/api/gateway/v1` (now backed by OmniRoute with backup
  failover), token unchanged.
- Per-agent `routingPreferred` is still read by the backup cascade for sticky
  routing; you may drop the per-agent **editor** while keeping the stored defaults
  (the cascade falls back to its own `AUTO` list when no preference is set).

Update the sidebar label if helpful (e.g. "Settings · Routing" → "Settings").

## 6. Phased plan

- **Phase 0 — Spike (no MC code).** Clone OmniRoute, get it running locally on
  `:20128`. Add a couple of the advertised **free** providers and **verify they
  actually answer** a chat completion (curl `http://localhost:20128/v1/chat/completions`).
  Confirm `/models`, the failure modes (what it returns when a provider is down),
  and whether it speaks `/responses` or only `/chat/completions`. Capture the exact
  start command for PM2. **Gate: don't proceed until free providers demonstrably
  work** — the whole premise is that OmniRoute can be primary.
- **Phase 1 — Tab + PM2 + fold-in.** OmniRoute under PM2 (T1); the Fleet Gateway
  tab with the **iframe** + folded-in analytics (T5); nav + petal wiring. No
  failover yet — MC still routes through `cascadeChat`; the tab just *shows*
  OmniRoute. Verifiable on its own.
- **Phase 2 — Failover wiring + status.** `lib/omniroute.ts` (T2), the transfer
  switch in the gateway route (T3), the failover policy (T4), and the live status
  banner + `/api/omniroute/status` (T5). Now traffic actually flows OmniRoute-first
  with the Backup Generator behind it.
- **Phase 3 — Slim Settings.** Remove the routing table + free-tier panel; keep
  the minimal Backup Generator config (T6/§5). Do this last so routing UI stays
  available as a safety net until failover is proven.

## 7. Constraints & risks (must hold)

- **Local-first.** OmniRoute is an external local service like the tunnel —
  **acceptable**, but be honest in the PR that it adds **a second process + a
  SQLite DB** to the footprint. MC itself stays DB-free (JSON store only).
- **MIT attribution.** OmniRoute is MIT-licensed — add an attribution line
  (README "Credits"/CHANGELOG and, if vendoring any snippet, keep its license).
  Do not relicense or strip notices.
- **OmniRoute concentrates secrets.** As a proxy it holds API keys for many
  providers in one SQLite DB. Same exposure rule as the rest of MC: never bind
  `:20128` to an untrusted network; it stays on `localhost`, reached remotely only
  behind the existing authenticating tunnel. Note this in the security section.
- **OmniRoute is young / fast-moving.** Pin a known-good commit/version; expect
  its API and UI to drift (the iframe + a thin client insulate us). **The Backup
  Generator is the safety net** — never remove it, and keep it independently
  funded with its own keys so an OmniRoute outage degrades gracefully instead of
  taking the fleet offline.
- **Verify "free" before trusting.** The "50+ free providers" claim must be
  confirmed in Phase 0; treat anything unverified as untrusted for the primary
  path.
- **Fail soft.** A dead OmniRoute must never 500 the MC gateway or crash a request
  — it must transparently fall through to the Backup Generator. Short probe
  timeout + circuit breaker so an outage doesn't add latency to every call.
- **No MC database. No second dev server on 4317. win32-arm64 aware.**

## 8. Acceptance criteria / verification

- `npm run build` clean; `npx tsc --noEmit | grep -v '^tests/'` clean.
- **Phase 0 transcript:** OmniRoute on `:20128` returns a real completion from at
  least one *free* provider (paste the curl). PM2 start command recorded.
- **Tab:** the Fleet Gateway nav link and orb petal both open the new surface; the
  OmniRoute iframe loads; the folded-in Backup Generator analytics render with the
  window switcher working.
- **Primary path:** with OmniRoute up, a request to
  `http://127.0.0.1:4317/api/gateway/v1/chat/completions` is served by OmniRoute
  (`X-MC-Served-By: omniroute`); status banner shows
  `Fleet Gateway ● online · Backup Generator ○ standby`.
- **Failover:** stop OmniRoute (`pm2 stop mc-omniroute`), repeat the request — it
  is served by the **Backup Generator** (`X-MC-Failover: 1`, `X-MC-Served-By:
  backup/...`), a `warn` failover event appears in Logs, and the banner flips to
  `Backup Generator ● ACTIVE`. Restart OmniRoute → traffic returns to it and the
  banner reverts. Paste the two transcripts + a screenshot of each banner state.
- **Settings:** routing table and free-tier panel are gone; the minimal Backup
  Generator config (provider keys + read-only cascade order) remains and still
  drives the fallback; the connection card's Base URL/token still work.
- **Secrets:** no raw keys reach the browser (`publicSettings` still booleans);
  MC keys are not written into OmniRoute's DB.

## 9. Out of scope (do NOT adopt)

- OmniRoute's **auth / multi-tenant / user-account** features — MC has its own
  single-user edge auth (`getGatewayToken`) and the tunnel. Don't layer
  OmniRoute's login on top.
- OmniRoute's **Electron / desktop-app** packaging, if any — we run it headless as
  a PM2 service and reach its UI through the iframe only.
- **Migrating MC's keys into OmniRoute** automatically, or building a secret-sync
  bridge between the two stores (§4 — duplication is accepted on purpose).
- A full **native re-skin** of OmniRoute's control panel (Option B in T5) — that's
  a later, optional follow-up; ship the iframe first.
- Removing or refactoring `lib/gateway.ts`'s cascade — it stays as the Backup
  Generator, demoted but intact.

## 10. Deliverable

A PR to `main` with: `lib/omniroute.ts` (client + probe + failover policy), the
failover wiring in `app/api/gateway/[...path]/route.ts`, the Fleet Gateway tab
(new page + `components/Shell.tsx` + `components/orb/petals.tsx`), the
`/api/omniroute/status` route, the slimmed `app/settings/page.tsx`, the PM2/README
docs for the OmniRoute process (+ optional watchdog), the MIT attribution, and a
CHANGELOG note. Include the Phase 0 spike transcript and the failover
verification transcripts/screenshots described in §8.
