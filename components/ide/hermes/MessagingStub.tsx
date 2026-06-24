"use client";

// Messaging tab — Discord fleet bot control panel. One bot, handed off to all
// agents (each speaks in its accent color). Dormant until a token is saved.

import { useCallback, useEffect, useState } from "react";

const OX = {
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};
const BLURPLE = "#5865F2";

interface Status {
  configured: boolean;
  connected: boolean;
  botTag: string | null;
  channelId: string | null;
  error: string | null;
}
interface Agent { id: string; name: string; accent: string; glyph: string }

const CHANNELS = [
  { id: "discord", label: "Discord", icon: "◈", active: true },
  { id: "telegram", label: "Telegram", icon: "✈", active: false },
  { id: "slack", label: "Slack", icon: "⬡", active: false },
  { id: "webhook", label: "Webhook", icon: "⚡", active: false },
];

export default function MessagingStub() {
  const [status, setStatus] = useState<Status | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [token, setToken] = useState("");
  const [channelId, setChannelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    fetch("/api/discord")
      .then((r) => r.json())
      .then((s: Status) => {
        setStatus(s);
        setChannelId((prev) => prev || (s.channelId ?? ""));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, [loadStatus]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((j) => setAgents(j.agents ?? []))
      .catch(() => {});
  }, []);

  const post = async (body: Record<string, unknown>, okNote: string) => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/discord", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.ok) { if (j.status) setStatus(j.status); setNote(okNote); setToken(""); }
      else setNote(j.error || "failed");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
      loadStatus();
    }
  };

  const dot = (color: string) => (
    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
  );

  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Channel picker */}
      <div className="flex w-36 shrink-0 flex-col gap-1 pt-1" style={{ borderRight: `1px solid ${OX.line}`, paddingRight: 16 }}>
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: OX.inkDim }}>Channels</div>
        {CHANNELS.map((ch) => (
          <div
            key={ch.id}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{
              color: ch.active ? OX.ink : OX.inkDim,
              background: ch.active ? "rgba(88,101,242,0.12)" : "transparent",
              border: `1px solid ${ch.active ? "rgba(88,101,242,0.4)" : "transparent"}`,
              opacity: ch.active ? 1 : 0.5,
            }}
          >
            <span>{ch.icon}</span>
            {ch.label}
            {!ch.active && <span className="ml-auto text-[9px] uppercase tracking-wider">soon</span>}
          </div>
        ))}
      </div>

      {/* Discord panel */}
      <div className="min-w-0 flex-1 overflow-y-auto pr-1">
        {/* Status line */}
        <div className="mb-4 flex items-center gap-2">
          {dot(status?.connected ? "#3ad07a" : status?.configured ? "#f5b75a" : OX.line)}
          <span className="text-sm font-semibold" style={{ color: OX.ink }}>
            {status?.connected ? `Online as ${status.botTag}` : status?.configured ? "Configured · connecting…" : "Not configured"}
          </span>
          {status?.error && <span className="text-[11px]" style={{ color: "#ff6b6b" }}>⚠ {status.error}</span>}
        </div>

        {/* Config form */}
        <div className="rounded-xl p-4" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: OX.inkDim }}>
            One bot · all agents
          </div>
          <label className="mb-1 block text-[11px]" style={{ color: OX.inkDim }}>Channel ID</label>
          <input
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="e.g. 1234567890123456789"
            className="mb-3 w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none"
            style={{ borderColor: OX.line, color: OX.ink }}
          />
          <label className="mb-1 block text-[11px]" style={{ color: OX.inkDim }}>
            Bot token {status?.configured && <span style={{ color: "#3ad07a" }}>· set (leave blank to keep)</span>}
          </label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
            placeholder={status?.configured ? "•••••••• (saved)" : "paste your Discord bot token"}
            className="mb-3 w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none"
            style={{ borderColor: OX.line, color: OX.ink }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => post({ action: "save", token: token || undefined, channelId }, "Saved.")}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40"
              style={{ background: BLURPLE, color: "#fff" }}
            >
              {busy ? "Saving…" : "Save & connect"}
            </button>
            {status?.configured && (
              <button
                onClick={() => post({ action: "reconnect" }, "Reconnecting…")}
                disabled={busy}
                className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                style={{ borderColor: OX.line, color: OX.inkDim }}
              >
                Reconnect
              </button>
            )}
            {note && <span className="text-xs" style={{ color: OX.inkDim }}>{note}</span>}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed" style={{ color: OX.inkDim }}>
            The token is write-only — stored encrypted, never shown back. Create a bot at the Discord Developer Portal,
            enable the <b>Message Content</b> intent, invite it to your server, and paste its token here.
          </p>
        </div>

        {/* Usage + agent legend */}
        <div className="mt-4 rounded-xl p-4" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: OX.inkDim }}>
            How to use
          </div>
          <p className="text-sm" style={{ color: OX.ink }}>
            In your channel, type <code className="rounded px-1" style={{ background: OX.surface2 }}>claude: explain closures</code> —
            the reply arrives as that agent, in its color. Type <code className="rounded px-1" style={{ background: OX.surface2 }}>help</code> to list agents.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => post({ action: "test", agentId: a.id }, `Test sent as ${a.name}.`)}
                disabled={busy || !status?.connected}
                title={status?.connected ? `Send a test message as ${a.name}` : "Connect the bot first"}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
                style={{ background: `${a.accent}1f`, color: a.accent, border: `1px solid ${a.accent}55` }}
              >
                {dot(a.accent)} {a.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
