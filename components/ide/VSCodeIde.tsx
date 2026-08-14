"use client";

import { useEffect, useMemo, useState } from "react";
import { useFetch } from "@/lib/useFetch";
import type { AgentDetail } from "@/lib/types";
import { hexA } from "@/lib/format";

interface VscodeCfg {
  up: boolean;
  token: string;
  localOrigin: string;
  remoteOrigin: string;
}

const DEFAULT_LOCAL = "http://127.0.0.1:4320";
const DEFAULT_REMOTE = "https://ide.decouvertquatrieme.online";

/**
 * VS Code in the browser — the native VS Code server (`code serve-web`),
 * proxied on its own origin so it iframes cleanly. The Antigravity extension
 * installed in that server adds the Mission Control activity-bar icon
 * (vault / agents / repos / health / activity) backed by MC's API, which the
 * proxy bridges at /mc-api/* — so everything the old Antigravity IDE did is
 * still one click away, inside real VS Code.
 */
export default function VSCodeIde({ agent }: { agent: AgentDetail }) {
  const { data } = useFetch<VscodeCfg>("/api/vscode", 10000);
  const accent = agent.accent;

  const [origin, setOrigin] = useState(DEFAULT_LOCAL);
  useEffect(() => {
    const host = window.location.hostname;
    const remote = host !== "127.0.0.1" && host !== "localhost" && host !== "::1";
    setOrigin(
      remote
        ? (data?.remoteOrigin ?? DEFAULT_REMOTE)
        : (data?.localOrigin ?? DEFAULT_LOCAL)
    );
  }, [data]);

  const up = data?.up ?? false;
  const src = useMemo(() => {
    if (!up || !data?.token) return "";
    return `${origin}/?tkn=${encodeURIComponent(data.token)}`;
  }, [up, data?.token, origin]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0d16] text-[var(--color-ink)]">
      {/* Title bar — VS Code identity + MC status */}
      <div className="flex h-9 shrink-0 items-center border-b border-white/10 px-3">
        <div className="flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
          </svg>
          <span className="font-semibold text-[var(--color-ink)]">VS Code</span>
          <span className="text-[var(--color-ink-4)]">— native editor · Antigravity extension loaded</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: up ? "var(--color-green)" : "var(--color-ink-4)" }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: up ? "var(--color-green)" : "var(--color-ink-4)" }} />
            {up ? "ide online" : "starting…"}
          </span>
          {up && (
            <a
              href={src}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-[var(--color-ink-3)] hover:bg-white/5"
            >
              Open in new tab ↗
            </a>
          )}
        </div>
      </div>

      {/* The IDE itself */}
      {up && src ? (
        <div className="min-h-0 flex-1">
          <iframe src={src} className="h-full w-full" style={{ border: 0 }} title="VS Code — Mission Control IDE" allow="clipboard-read; clipboard-write" />
        </div>
      ) : (
        <div className="grid flex-1 place-items-center p-12 text-center">
          <div className="max-w-md">
            <div className="mb-4 text-4xl text-[var(--color-ink-4)]">⌘</div>
            <h3 className="mb-2 text-lg font-medium">Booting VS Code server…</h3>
            <p className="mb-6 text-sm text-[var(--color-ink-3)]">
              The native VS Code web server is starting. It binds a local port, then the
              Antigravity extension loads and Mission Control's panels appear in the
              activity bar on the left.
            </p>
            <code className="block rounded border px-4 py-2 text-xs" style={{ borderColor: hexA(accent, 0.3), color: accent }}>
              pm2 status mc-vscode
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
