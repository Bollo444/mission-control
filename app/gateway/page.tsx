"use client";

import { useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AnalyticsRow } from "@/lib/usage";
import { PageHeader, Screen, Stat } from "@/components/ui";
import { hexA } from "@/lib/format";

const WINDOWS: { k: string; label: string }[] = [
  { k: "1d", label: "Today" },
  { k: "7d", label: "7 days" },
  { k: "30d", label: "30 days" },
];

const SIGNAL = "#46e0d0";

function rateColor(r: number | null): string {
  if (r === null) return "var(--color-ink-4)";
  return r > 0.9 ? "#5cd6a0" : r > 0.6 ? "#e0b341" : "#ff6b6b";
}

interface OmniStatus {
  up: boolean;
  latencyMs: number;
  failoverActive: boolean;
  lastFailover?: string;
  omnirouteBase: string;
}

export default function GatewayPage() {
  const [win, setWin] = useState("7d");
  const { data: analytics } = useFetch<{ window: string; rows: AnalyticsRow[]; generatedAt: string }>(
    `/api/analytics?window=${win}`,
    5000
  );
  const { data: status } = useFetch<OmniStatus>("/api/omniroute/status", 5000);

  const rows = analytics?.rows ?? [];
  const totalReq = rows.reduce((n, r) => n + r.requests, 0);
  const totalOk = rows.reduce((n, r) => n + r.successes, 0);
  const totalTok = rows.reduce((n, r) => n + r.tokens, 0);
  const maxReq = Math.max(1, ...rows.map((r) => r.requests));

  const isUp = status?.up ?? false;
  const failover = status?.failoverActive ?? false;

  return (
    <Screen
      header={
        <PageHeader
          eyebrow="Failover Router"
          title="Backup Generator"
          sub="Mission Control's in-app failover router — Power Plant (OmniRoute) is primary; this Backup Generator stands by with real telemetry when it ever trips."
          right={
            <div className="flex overflow-hidden rounded-lg border">
              {WINDOWS.map((w) => (
                <button
                  key={w.k}
                  onClick={() => setWin(w.k)}
                  className="px-3 py-2 text-sm transition-colors"
                  style={
                    win === w.k
                      ? { background: hexA(SIGNAL, 0.16), color: SIGNAL }
                      : { color: "var(--color-ink-3)" }
                  }
                >
                  {w.label}
                </button>
              ))}
            </div>
          }
        />
      }
    >
      <div className="px-8 py-7">
        {/* Status Banner */}
        <div className="mc-panel mb-6 flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isUp ? 'mc-live-dot' : 'bg-[var(--color-ink-4)]'}`}
                style={isUp ? { background: 'var(--color-green)' } : {}}
              />
              <span className="text-sm font-medium">
                Power Plant <span className="text-[var(--color-ink-4)] lowercase">● {isUp ? 'online' : 'offline'}</span>
              </span>
            </div>
            <div className="flex items-center gap-2 border-l pl-6">
              <span
                className={`h-2 w-2 rounded-full ${failover ? 'mc-live-dot' : ''}`}
                style={{ background: failover ? 'var(--color-amber)' : 'var(--color-surface-3)' }}
              />
              <span className="text-sm font-medium">
                Backup Generator <span className="text-[var(--color-ink-4)] lowercase">● {failover ? 'ACTIVE' : 'standby'}</span>
              </span>
            </div>
          </div>
          {isUp && status?.latencyMs && (
            <span className="text-[10px] tabular-nums text-[var(--color-ink-4)] uppercase tracking-wider">
              {status.latencyMs}ms latency
            </span>
          )}
          <a
            href="/power-plant"
            className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-[var(--color-signal)] hover:text-[var(--color-signal)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            Open Power Plant →
          </a>
        </div>

        <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">
          Backup Generator Telemetry
        </div>

        {/* summary */}
        <div className="mc-panel mb-6 flex flex-wrap gap-10 px-6 py-5">
          <Stat value={totalReq.toLocaleString()} label="requests" />
          <Stat
            value={<span style={{ color: rateColor(totalReq ? totalOk / totalReq : null) }}>{totalReq ? Math.round((totalOk / totalReq) * 100) : 0}</span>}
            unit="%"
            label="success rate"
          />
          <Stat value={totalTok.toLocaleString()} label="tokens" />
          <Stat value={rows.length} label="providers used" />
        </div>

        {/* per-provider */}
        <section className="mc-panel overflow-hidden">
          <div className="border-b px-5 py-3 text-sm font-semibold">Standby History (By provider)</div>
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-[var(--color-ink-4)]">
              No backup traffic in this window yet. The generator is idling.
            </div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.provider} className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <span className="w-28 shrink-0 text-sm font-medium">{r.provider}</span>
                  <div className="flex min-w-[140px] flex-1 items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.round((r.requests / maxReq) * 100)}%`, background: SIGNAL }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--color-ink-3)]">
                      {r.requests.toLocaleString()}
                    </span>
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums" style={{ color: rateColor(r.successRate) }}>
                    {r.successRate !== null ? `${Math.round(r.successRate * 100)}%` : "—"}
                  </span>
                  <span className="w-20 text-right text-xs tabular-nums text-[var(--color-ink-4)]">
                    {r.avgLatencyMs !== null ? `${r.avgLatencyMs}ms` : "—"}
                  </span>
                  <span className="w-24 text-right text-xs tabular-nums text-[var(--color-ink-4)]">
                    {r.tokens.toLocaleString()} tok
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="border-t px-5 py-2 text-[10px] text-[var(--color-ink-4)]">
            Aggregated from the Backup Generator usage ledger. Keys are configured in Settings.
          </div>
        </section>
      </div>
    </Screen>
  );
}
