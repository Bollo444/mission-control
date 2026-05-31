import type { Metadata } from "next";
import "./globals.css";
import { AGENTS } from "@/lib/registry";
import Shell from "@/components/Shell";
import type { NavAgent } from "@/lib/types";

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
        <Shell nav={nav}>{children}</Shell>
      </body>
    </html>
  );
}
