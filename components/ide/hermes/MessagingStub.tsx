"use client";

// Messaging tab — placeholder shell for Telegram/Discord/Slack/etc.
// The user explicitly deferred messaging to last; this is a tasteful
// "coming soon" surface that matches the SkillsAndTools left-picker pattern.

const OX = {
  base: "#08080a",
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};

const CHANNELS = [
  { id: "telegram", label: "Telegram", icon: "✈" },
  { id: "discord", label: "Discord", icon: "◈" },
  { id: "slack", label: "Slack", icon: "⬡" },
  { id: "email", label: "E-mail", icon: "✉" },
  { id: "webhook", label: "Webhook", icon: "⚡" },
];

export default function MessagingStub() {
  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Left picker — mirrors SkillsAndTools */}
      <div
        className="flex w-36 shrink-0 flex-col gap-1 pt-1"
        style={{ borderRight: `1px solid ${OX.line}`, paddingRight: "16px" }}
      >
        <div
          className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: OX.inkDim }}
        >
          Channels
        </div>
        {CHANNELS.map((ch) => (
          <div
            key={ch.id}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
            style={{ color: OX.inkDim, border: "1px solid transparent" }}
          >
            <span>{ch.icon}</span>
            {ch.label}
          </div>
        ))}
      </div>

      {/* Empty state — centered, tasteful */}
      <div className="flex min-w-0 flex-1 items-center justify-center">
        <div className="max-w-xs text-center">
          <div
            className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              background: "rgba(245,183,90,0.08)",
              boxShadow: `inset 0 0 0 1px rgba(245,183,90,0.20)`,
            }}
          >
            <span className="text-2xl">✉</span>
          </div>
          <p
            className="mb-1 font-serif text-lg font-semibold"
            style={{ color: OX.ink }}
          >
            Messaging
          </p>
          <p className="text-sm leading-relaxed" style={{ color: OX.inkDim }}>
            Configured last, after the dashboard is assembled.
          </p>
          <p
            className="mt-3 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: OX.gold, opacity: 0.7 }}
          >
            Coming soon
          </p>
        </div>
      </div>
    </div>
  );
}
