"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import { PageHeader, Screen } from "@/components/ui";

interface PowerStatus {
  up: boolean;
  latencyMs: number;
  failoverActive: boolean;
  omnirouteBase: string;
}

/**
 * The Power Plant — OmniRoute's dashboard, embedded so you never leave Mission Control.
 *
 * The dashboard must be served from a SAME-SITE origin as this page, otherwise the
 * browser treats the iframe as third-party and blocks its login cookie. Mission Control
 * is reached over HTTPS through the Cloudflare tunnel (mission-control.decouvertquatrieme.online),
 * so the dashboard rides the tunnel as a sibling subdomain (powerplant.decouvertquatrieme.online)
 * — same registrable domain, first-party cookies, no mixed content. When Mission Control is
 * opened directly on the loopback, the local :4318 proxy is used instead.
 */
export default function PowerPlantPage() {
  const { data: status } = useFetch<PowerStatus>("/api/omniroute/status", 5000);
  const isUp = status?.up ?? false;
  const base = (status?.omnirouteBase ?? "http://localhost:20128/v1").replace(/\/v1$/, "");

  const [dashboardOrigin, setDashboardOrigin] = useState("http://127.0.0.1:4318");
  useEffect(() => {
    const host = window.location.hostname;
    const remote = host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
    setDashboardOrigin(remote ? "https://powerplant.decouvertquatrieme.online" : "http://127.0.0.1:4318");
  }, []);

  return (
    <Screen
      header={
        <PageHeader
          eyebrow="Primary Inference"
          title="Power Plant"
          sub="OmniRoute — 230+ providers, auto-fallback, compression. All agents route here first; the Backup Generator stands by."
          right={
            <div className="flex items-center gap-4 text-right">
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: isUp ? "var(--color-green)" : "var(--color-ink-4)" }}
                />
                <span className="text-sm font-medium">
                  {isUp ? "online" : "offline"}
                  {isUp && status?.latencyMs ? (
                    <span className="ml-2 text-[10px] tabular-nums text-[var(--color-ink-4)] uppercase tracking-wider">
                      {status.latencyMs}ms
                    </span>
                  ) : null}
                </span>
              </div>
            </div>
          }
        />
      }
    >
      <div className="flex h-full flex-col px-8 py-6">
        <div className="mc-panel mb-4 flex items-center justify-between px-5 py-3">
          <span className="text-sm font-semibold">OmniRoute Dashboard</span>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[var(--color-ink-4)] uppercase tracking-wider">{base}</span>
            <a
              href={dashboardOrigin}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold transition-colors hover:border-[var(--color-signal)] hover:text-[var(--color-signal)]"
            >
              Open in new tab ↗
            </a>
          </div>
        </div>

        {isUp ? (
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-base)]">
            <iframe
              src={`${dashboardOrigin}/dashboard`}
              className="h-full w-full"
              style={{ border: 0, minHeight: 560 }}
              title="Power Plant — OmniRoute dashboard"
            />
          </div>
        ) : (
          <div className="mc-panel grid flex-1 place-items-center p-12 text-center">
            <div className="max-w-md">
              <div className="mb-4 text-4xl text-[var(--color-ink-4)]">⬚</div>
              <h3 className="mb-2 text-lg font-medium">Power Plant Unreachable</h3>
              <p className="mb-6 text-sm text-[var(--color-ink-3)]">
                OmniRoute is not responding at {base}. Automatic failover to the Backup Generator is active — your
                agents are still being served.
              </p>
              <code className="block rounded border border-[var(--color-signal)]/20 bg-black/30 px-4 py-2 text-xs text-[var(--color-signal)]">
                pm2 start mc-omniroute
              </code>
            </div>
          </div>
        )}
      </div>
    </Screen>
  );
}
