"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { PublicSettings, AgentsResp, HealthState, ProviderStatus } from "@/lib/types";
import type { UsageRow } from "@/lib/usage";
import { PageHeader, Screen } from "@/components/ui";
import { hexA } from "@/lib/format";

export default function SettingsPage() {
  const { data, reload } = useFetch<PublicSettings>("/api/settings", 0);
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 0);
  const { data: health, reload: reloadHealth } = useFetch<HealthState>("/api/health", 0);
  const { data: usageData } = useFetch<{ usage: UsageRow[]; generatedAt: string }>("/api/usage", 6000);

  // The table edits the PREFERRED route (the user's chosen default). The live
  // "effective" route (data.routing) can differ when the health monitor has
  // failed an agent over — that's surfaced as a badge, not folded into intent.
  const [routing, setRouting] = useState<PublicSettings["routing"]>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<"idle" | "saving" | "ok">("idle");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (data) setRouting(data.routingPreferred ?? data.routing);
  }, [data]);

  if (!data || !agentsData) {
    return <div className="px-8 py-10 text-[var(--color-ink-4)]">Loading settings…</div>;
  }

  const providers = data.providers;
  const agents = agentsData.agents;
  const usageBy: Record<string, UsageRow> = Object.fromEntries(
    (usageData?.usage ?? []).map((u) => [u.provider, u])
  );
  const totalServed = (usageData?.usage ?? []).reduce((n, r) => n + r.successes, 0);
  const activeProviders = (usageData?.usage ?? []).filter((r) => r.requests > 0).length;

  function setRoute(agentId: string, patch: Partial<{ provider: string; model: string }>) {
    setRouting((r) => {
      const cur = r[agentId] ?? { provider: "anthropic", model: "" };
      const next = { ...cur, ...patch };
      if (patch.provider) {
        const p = providers.find((x) => x.id === patch.provider);
        next.model = p?.models[0] ?? next.model;
      }
      return { ...r, [agentId]: next };
    });
  }

  async function save() {
    setSaved("saving");
    const apiKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) if (v.trim()) apiKeys[k] = v.trim();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routing, apiKeys }),
    });
    setKeys({});
    setSaved("ok");
    reload();
    setTimeout(() => setSaved("idle"), 1800);
  }

  async function checkNow() {
    setChecking(true);
    try {
      await fetch("/api/health", { method: "POST" });
      reloadHealth();
      reload();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen
      header={
        <PageHeader
        eyebrow="Control plane"
        title="Settings · Model Routing"
        sub="One place to route each agent to a provider + model and manage shared API keys. Routing is stored centrally and surfaced on every agent's page."
        right={
          <button
            onClick={save}
            disabled={saved === "saving"}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-[#0b0c0f]"
            style={{ background: "var(--color-signal)" }}
          >
            {saved === "saving" ? "Saving…" : saved === "ok" ? "Saved ✓" : "Save changes"}
          </button>
        }
        />
      }
    >
      <div className="grid grid-cols-1 gap-6 px-8 py-7 xl:grid-cols-[1fr_380px]">
        {/* Routing table */}
        <section className="mc-panel overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Per-agent model routing</h2>
            <p className="text-xs text-[var(--color-ink-4)]">
              Choose the brain behind each agent — this sets its preferred default.
            </p>
          </div>
          <div className="divide-y">
            {agents.map((a) => {
              const route = routing[a.id] ?? { provider: "anthropic", model: "" };
              const prov = providers.find((p) => p.id === route.provider);
              const eff = data.routing[a.id];
              const pref = data.routingPreferred?.[a.id];
              const failedOver =
                eff && pref && (eff.provider !== pref.provider || eff.model !== pref.model);
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                >
                  <span className="flex min-w-[160px] items-center gap-2">
                    <span
                      className="grid h-7 w-7 place-items-center rounded-lg text-sm font-bold"
                      style={{ background: hexA(a.accent, 0.16), color: a.accent }}
                    >
                      {a.glyph}
                    </span>
                    <span className="text-sm font-medium">{a.name}</span>
                  </span>
                  <Select
                    value={route.provider}
                    onChange={(v) => setRoute(a.id, { provider: v })}
                    options={providers.map((p) => ({
                      value: p.id,
                      label: p.free ? `${p.name} · free` : p.name,
                    }))}
                  />
                  <Select
                    value={route.model}
                    onChange={(v) => setRoute(a.id, { model: v })}
                    options={(prov?.models ?? []).map((m) => ({ value: m, label: m }))}
                    grow
                  />
                  {failedOver && (
                    <span className="basis-full pl-1 text-[10px] text-[#e0b341]">
                      ⚠ failover active — running{" "}
                      <span className="font-mono">{eff.provider}/{eff.model}</span> because{" "}
                      <span className="font-mono">{pref.provider}/{pref.model}</span> is down;
                      auto-reverts when it's back.
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Free-tier limits + live availability — sits under the last agent (Kilo) */}
          <div className="border-t px-5 py-4">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">
                Free-tier limits{" "}
                <span className="font-normal text-[var(--color-ink-4)]">&amp; live status</span>
              </h3>
              <button
                onClick={checkNow}
                disabled={checking}
                className="rounded-md border px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-2)] hover:border-[var(--color-ink-4)] disabled:opacity-50"
              >
                {checking ? "Checking…" : "Check now"}
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[var(--color-ink-4)]">
              Roughly how much you can use each free provider, plus whether its endpoint
              is reachable right now. Hermes re-checks every{" "}
              {health ? Math.max(1, Math.round(health.intervalMinutes / 60)) : 6}h
              {health?.lastCheckedAt ? ` · last checked ${timeAgo(health.lastCheckedAt)}` : " · not checked yet"}.
              If a model goes down, OpenCode auto-routes that agent to a healthy free
              one and reverts when it returns.
            </p>
            <ul className="flex flex-col gap-2.5">
              {providers
                .filter((p) => p.free)
                .map((p) => {
                  const h = health?.providers?.[p.id];
                  return (
                    <li
                      key={p.id}
                      className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-2)]">
                          <StatusDot status={h?.status} />
                          {p.name}
                        </span>
                        <span className="text-[11px] leading-relaxed text-[var(--color-ink-4)]">
                          {p.freeLimit ?? "Rate-limited free tier"}
                          {h?.status && h.status !== "available" && (
                            <span className="text-[var(--color-ink-3)]">
                              {" "}· {statusLabel(h.status)}
                              {h.detail ? ` (${h.detail})` : ""}
                            </span>
                          )}
                        </span>
                      </div>
                      <Gauge u={usageBy[p.id]} />
                    </li>
                  );
                })}
            </ul>
          </div>
        </section>

        {/* API keys + vault */}
        <div className="flex flex-col gap-6">
          <section className="mc-panel p-5">
            <h2 className="mb-1 text-sm font-semibold">Provider API keys</h2>
            <p className="mb-4 text-xs text-[var(--color-ink-4)]">
              Stored locally in <code className="text-[var(--color-ink-3)]">~/.mission-control</code>.
              Values are never sent back to the browser.{" "}
              {data.encryption ? (
                <span className="text-[#5cd6a0]">🔒 Encrypted at rest.</span>
              ) : (
                <span>
                  Set <code className="text-[var(--color-ink-3)]">MC_ENCRYPTION_KEY</code> to encrypt at rest.
                </span>
              )}
            </p>
            <div className="flex flex-col gap-3">
              {providers.map((p) => {
                const configured = data.keyStatus[p.keyEnv];
                return (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-2)]">
                        {p.name}
                        {p.free && (
                          <span
                            className="rounded px-1 py-px text-[9px] font-semibold uppercase"
                            style={{ background: hexA("#5cd6a0", 0.15), color: "#5cd6a0" }}
                          >
                            free
                          </span>
                        )}
                        <span className="font-mono text-[10px] text-[var(--color-ink-4)]">
                          {p.keyEnv}
                        </span>
                      </label>
                      <span
                        className="text-[10px]"
                        style={{ color: configured ? "var(--color-green)" : "var(--color-ink-4)" }}
                      >
                        {configured ? "● configured" : "○ not set"}
                      </span>
                    </div>
                    <input
                      type="password"
                      value={keys[p.keyEnv] ?? ""}
                      onChange={(e) =>
                        setKeys((k) => ({ ...k, [p.keyEnv]: e.target.value }))
                      }
                      placeholder={configured ? "•••••••• (set — leave blank to keep)" : "paste key to set"}
                      className="w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--color-ink-4)]"
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mc-panel p-5">
            <h2 className="mb-1 text-sm font-semibold">Fleet Gateway</h2>
            <p className="mb-3 text-xs leading-relaxed text-[var(--color-ink-4)]">
              One OpenAI-compatible endpoint in front of every free provider, with
              automatic cascade on rate-limits. Point an agent/tool's base URL here
              and use the token as its API key. Send header{" "}
              <code className="text-[var(--color-ink-3)]">X-MC-Agent: &lt;id&gt;</code> to route by that
              agent's preferred model, or use model{" "}
              <code className="text-[var(--color-ink-3)]">auto</code> to let the fleet pick.
            </p>
            <CopyRow label="Base URL" value="http://127.0.0.1:4317/api/gateway/v1" />
            <CopyRow label="Token (use as the API key)" value={data.gatewayToken} />
            {totalServed > 0 && (
              <p className="mt-1 text-[11px] text-[var(--color-ink-4)]">
                {totalServed.toLocaleString()} request{totalServed === 1 ? "" : "s"} served today across{" "}
                {activeProviders} provider{activeProviders === 1 ? "" : "s"} — per-provider usage in the gauges.
              </p>
            )}
          </section>

          <section className="mc-panel-2 p-5 text-sm">
            <h2 className="mb-1 font-semibold">Vault</h2>
            <p className="text-xs text-[var(--color-ink-4)]">Shared memory location</p>
            <code className="mt-2 block break-all rounded-lg bg-[var(--color-surface)] px-2.5 py-2 font-mono text-[11px] text-[var(--color-ink-2)]">
              {data.vaultDir}
            </code>
            <p className="mt-2 text-[11px] text-[var(--color-ink-4)]">
              Override with the <code>MC_VAULT_DIR</code> environment variable to point
              at an existing Obsidian vault.
            </p>
          </section>
        </div>
      </div>
    </Screen>
  );
}

function Select({
  value,
  onChange,
  options,
  grow,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  grow?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-ink-4)] ${
        grow ? "min-w-0 flex-1" : "w-[150px]"
      }`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-[var(--color-surface-2)]">
          {o.label}
        </option>
      ))}
    </select>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function statusLabel(s: ProviderStatus): string {
  return s === "available"
    ? "available"
    : s === "unavailable"
      ? "unreachable"
      : s === "unconfigured"
        ? "no key set"
        : "unknown";
}

function statusColor(s?: ProviderStatus): string {
  return s === "available"
    ? "#5cd6a0"
    : s === "unavailable"
      ? "#ff6b6b"
      : s === "unconfigured"
        ? "#6b7280"
        : "#e0b341"; // unknown / not yet checked
}

function StatusDot({ status }: { status?: ProviderStatus }) {
  const c = statusColor(status);
  return (
    <span
      title={status ? statusLabel(status) : "not checked yet"}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: c, boxShadow: `0 0 6px ${c}` }}
    />
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[11px] font-medium text-[var(--color-ink-3)]">{label}</div>
      <div className="flex items-center gap-2">
        <code
          className="min-w-0 flex-1 truncate rounded-lg bg-[var(--color-surface)] px-2.5 py-2 font-mono text-[11px] text-[var(--color-ink-2)]"
          title={value}
        >
          {value || "—"}
        </code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              /* clipboard blocked */
            }
          }}
          className="shrink-0 rounded-lg border px-2.5 py-2 text-xs text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)]"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Gauge({ u }: { u?: UsageRow }) {
  if (!u || u.requests === 0) {
    return <span className="shrink-0 text-[10px] text-[var(--color-ink-4)] sm:text-right">no gateway traffic yet</span>;
  }
  const rpd = u.effRpd;
  const used = rpd != null && u.rpdRemaining != null ? Math.max(0, rpd - u.rpdRemaining) : u.reqDay;
  const pct = rpd ? Math.min(100, Math.round((used / rpd) * 100)) : null;
  const bar = pct === null ? "#6ea8fe" : pct > 90 ? "#ff6b6b" : pct > 70 ? "#e0b341" : "#5cd6a0";
  return (
    <div className="w-full shrink-0 sm:w-48">
      <div className="flex items-center justify-between text-[10px] text-[var(--color-ink-3)]">
        <span>
          {rpd
            ? `${used.toLocaleString()} / ${rpd.toLocaleString()} req today`
            : `${u.reqDay.toLocaleString()} req today`}
          {u.live && <span className="text-[#5cd6a0]"> · live</span>}
        </span>
        {u.over && <span style={{ color: "#ff6b6b" }}>over</span>}
      </div>
      {pct !== null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
        </div>
      )}
      <div className="mt-1 flex items-center gap-2 text-[9px] text-[var(--color-ink-4)]">
        {u.rpdRemaining != null && <span>{u.rpdRemaining.toLocaleString()} left</span>}
        {u.successRate !== null && <span>· {Math.round(u.successRate * 100)}% ok</span>}
        {u.avgLatencyMs !== null && <span>· {u.avgLatencyMs}ms avg</span>}
      </div>
    </div>
  );
}
