"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { PublicSettings, AgentsResp } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { hexA } from "@/lib/format";

export default function SettingsPage() {
  const { data, reload } = useFetch<PublicSettings>("/api/settings", 0);
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 0);

  const [routing, setRouting] = useState<PublicSettings["routing"]>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<"idle" | "saving" | "ok">("idle");

  useEffect(() => {
    if (data) setRouting(data.routing);
  }, [data]);

  if (!data || !agentsData) {
    return <div className="px-8 py-10 text-[var(--color-ink-4)]">Loading settings…</div>;
  }

  const providers = data.providers;
  const agents = agentsData.agents;

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

  return (
    <>
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

      <div className="grid grid-cols-1 gap-6 px-8 py-7 xl:grid-cols-[1fr_380px]">
        {/* Routing table */}
        <section className="mc-panel overflow-hidden">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Per-agent model routing</h2>
            <p className="text-xs text-[var(--color-ink-4)]">
              Choose the brain behind each agent.
            </p>
          </div>
          <div className="divide-y">
            {agents.map((a) => {
              const route = routing[a.id] ?? { provider: "anthropic", model: "" };
              const prov = providers.find((p) => p.id === route.provider);
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
                    options={providers.map((p) => ({ value: p.id, label: p.name }))}
                  />
                  <Select
                    value={route.model}
                    onChange={(v) => setRoute(a.id, { model: v })}
                    options={(prov?.models ?? []).map((m) => ({ value: m, label: m }))}
                    grow
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* API keys + vault */}
        <div className="flex flex-col gap-6">
          <section className="mc-panel p-5">
            <h2 className="mb-1 text-sm font-semibold">Provider API keys</h2>
            <p className="mb-4 text-xs text-[var(--color-ink-4)]">
              Stored locally in <code className="text-[var(--color-ink-3)]">~/.mission-control</code>.
              Values are never sent back to the browser.
            </p>
            <div className="flex flex-col gap-3">
              {providers.map((p) => {
                const configured = data.keyStatus[p.keyEnv];
                return (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-medium text-[var(--color-ink-2)]">
                        {p.name}{" "}
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
    </>
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
