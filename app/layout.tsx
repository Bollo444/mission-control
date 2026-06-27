import type { Metadata } from "next";
import "./globals.css";
import { AGENTS } from "@/lib/registry";
import Shell from "@/components/Shell";
import type { NavAgent } from "@/lib/types";
import { ThemeProvider } from "@/lib/theme";
import ChaosColorMode from "@/components/ChaosColorMode";

export const metadata: Metadata = {
  title: "Mission Control · Agent Fleet",
  description:
    "Unified command center for 9 AI coding agents — Claude Code, Hermes, Pi, OpenCode, Antigravity, OpenClaw, jcode, Vibe, Kilo — with a live system terminal, an Obsidian shared-memory vault, and a team-meeting boardroom.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nav: NavAgent[] = AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    accent: a.accent,
    glyph: a.glyph,
    primary: a.primary,
    kind: a.kind,
  }));

  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <Shell nav={nav}>{children}</Shell>
          <ChaosColorMode
            enabled={false}
            minInterval={100}
            maxInterval={3000}
            selectors="h1, h2, h3, h4, h5, h6, p, span, a, button, label, .mc-stat-value, [class*='ink'], .mc-panel, .mc-panel-2, .mc-glow-edge, .mc-live-dot, .mc-anim-spin, .mc-anim-float, .mc-anim-breathe, .mc-iris-layer"
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
