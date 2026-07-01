"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { PublicSettings, AgentsResp, HealthState, ProviderStatus } from "@/lib/types";
import type { UsageRow } from "@/lib/usage";
import { PageHeader, Screen } from "@/components/ui";
import { hexA } from "@/lib/format";
import { useTheme, ThemePalette } from "@/lib/theme";

/**
 * Settings — Minimal "Backup Generator" configuration.
 * Per-agent routing and free-tier status moved to the Fleet Gateway (OmniRoute).
 */

export default function SettingsPage() {
  const { data, reload } = useFetch<PublicSettings>("/api/settings", 0);
  const { data: agentsData } = useFetch<AgentsResp>("/api/agents", 0);
  const { data: health } = useFetch<HealthState>("/api/health", 0);
  const { data: usageData } = useFetch<{ usage: UsageRow[]; generatedAt: string }>("/api/usage", 6000);

  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<"idle" | "saving" | "ok">("idle");
  const theme = useTheme();

  if (!data || !agentsData) {
    return <div className="px-8 py-10 text-[var(--color-ink-4)]">Loading settings…</div>;
  }

  const providers = data.providers;
  const usageBy: Record<string, UsageRow> = Object.fromEntries(
    (usageData?.usage ?? []).map((u) => [u.provider, u])
  );
  const totalServed = (usageData?.usage ?? []).reduce((n, r) => n + r.successes, 0);
  const activeProviders = (usageData?.usage ?? []).filter((r) => r.requests > 0).length;

  const AUTO_CASCADE = [
    { provider: "cerebras", model: "gpt-oss-120b" },
    { provider: "nim", model: "qwen/qwen3-coder-480b-a35b-instruct" },
    { provider: "groq", model: "llama-3.3-70b-versatile" },
    { provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct" },
    { provider: "openrouter", model: "qwen/qwen3-coder:free" },
    { provider: "mistral", model: "codestral-latest" },
    { provider: "github", model: "openai/gpt-4o-mini" },
    { provider: "opencode", model: "big-pickle" },
  ];

  async function save() {
    setSaved("saving");
    const apiKeys: Record<string, string> = {};
    for (const [k, v] of Object.entries(keys)) if (v.trim()) apiKeys[k] = v.trim();
    await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKeys }),
    });
    setKeys({});
    setSaved("ok");
    reload();
    setTimeout(() => setSaved("idle"), 1800);
  }

  return (
    <Screen
      header={
        <PageHeader
        eyebrow="Control plane"
        title="Settings"
        sub="Manage shared API keys, vault location, and standby generator configuration."
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

        {/* Left Column: API Keys + Backup Config */}
        <div className="flex flex-col gap-6">
          <section className="mc-panel p-5">
            <h2 className="mb-1 text-sm font-semibold text-[var(--color-amber)]">Backup Generator (Standby)</h2>
            <p className="mb-4 text-xs text-[var(--color-ink-4)]">
              API keys for the internal failover cascade. These are only used when the primary Fleet Gateway is unreachable.
              Stored locally in <code className="text-[var(--color-ink-3)]">~/.mission-control</code>.
            </p>
            <div className="flex flex-col gap-3">
              {providers.map((p) => {
                const configured = data.keyStatus[p.keyEnv];
                return (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-ink-2)]">
                        {p.name}
                        <span className="font-mono text-[10px] text-[var(--color-ink-4)]">
                          {p.keyEnv}
                        </span>
                      </label>
                      <span
                        className="text-[10px]"
                        style={{ color: configured ? "var(--color-green)" : "var(--color-ink-4)" }}
                      >
                        {configured ? "● set" : "○ not set"}
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

          <section className="mc-panel overflow-hidden">
            <div className="border-b px-5 py-4">
              <h2 className="text-sm font-semibold">Standby Cascade Order</h2>
              <p className="text-xs text-[var(--color-ink-4)]">
                The Backup Generator tries these models in order during a failover.
              </p>
            </div>
            <div className="divide-y">
              {AUTO_CASCADE.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3 text-xs">
                  <span className="flex items-center gap-3">
                    <span className="w-4 text-[var(--color-ink-4)]">{i + 1}.</span>
                    <span className="font-medium">{r.provider}</span>
                  </span>
                  <span className="font-mono text-[var(--color-ink-3)]">{r.model}</span>
                </div>
              ))}
            </div>
            <div className="bg-[var(--color-surface)] px-5 py-3 text-[10px] text-[var(--color-ink-4)] italic">
              Order is currently hardcoded in lib/gateway.ts for maximum reliability.
            </div>
          </section>
        </div>

        {/* Right Column: Connection + Vault + Theme */}
        <div className="flex flex-col gap-6">
          <section className="mc-panel p-5">
            <h2 className="mb-1 text-sm font-semibold">Fleet Gateway (Primary)</h2>
            <p className="mb-3 text-xs leading-relaxed text-[var(--color-ink-4)]">
              The primary OpenAI-compatible endpoint. Point an agent/tool's base URL here
              and use the token as its API key.
            </p>
            <CopyRow label="Base URL" value="http://127.0.0.1:4317/api/gateway/v1" />
            <CopyRow label="Token (use as the API key)" value={data.gatewayToken} />
            {totalServed > 0 && (
              <p className="mt-1 text-[11px] text-[var(--color-ink-4)]">
                {totalServed.toLocaleString()} backup request{totalServed === 1 ? "" : "s"} served today — see Fleet Gateway tab for primary metrics.
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
              Override with <code>MC_VAULT_DIR</code>.
            </p>
          </section>

          <section className="mc-panel p-5">
            <h2 className="mb-1 text-sm font-semibold">Theme</h2>
            <p className="mb-3 text-xs text-[var(--color-ink-4)]">
              {theme.manual
                ? "Pinned. Auto resumes the 6-hour time-of-day rotation."
                : "Auto — rotates every 6 hours by time of day. Pick one to pin it."}
            </p>
            <div className="flex flex-wrap gap-2">
              {theme.allThemes.map((t: ThemePalette) => {
                const active = theme.manual && theme.currentTheme.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => theme.setThemeById(t.id)}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                    style={{
                      borderColor: active ? t.signal : "var(--color-line)",
                      background: active ? `${hexA(t.signal, 0.12)}` : "transparent",
                      color: active ? t.signal : "var(--color-ink)",
                    }}
                  >
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded"
                      style={{ background: t.signal }}
                    />
                    {t.name}
                  </button>
                );
              })}
              <button
                onClick={() => theme.setAuto()}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
                style={{
                  borderColor: !theme.manual ? "var(--color-signal)" : "var(--color-line)",
                  background: !theme.manual ? hexA("#ffffff", 0.06) : "transparent",
                  color: !theme.manual ? "var(--color-signal)" : "var(--color-ink-3)",
                }}
              >
                Auto
              </button>
            </div>
          </section>
        </div>
      </div>
    </Screen>
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
