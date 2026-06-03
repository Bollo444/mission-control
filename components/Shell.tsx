"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { NavAgent } from "@/lib/types";
import { hexA } from "@/lib/format";
import RouteTransition from "./RouteTransition";
import { useEdgeAutoScroll } from "./useEdgeAutoScroll";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors"
      style={{
        background: active ? "var(--color-surface-3)" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-ink-3)",
      }}
    >
      {children}
    </Link>
  );
}

function AgentNav({ a, active }: { a: NavAgent; active: boolean }) {
  return (
    <Link
      href={`/agents/${a.id}`}
      className="mc-glow-edge group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm transition-colors"
      style={
        {
          background: active ? hexA(a.accent, 0.12) : "transparent",
          color: active ? "var(--color-ink)" : "var(--color-ink-2)",
          ["--glow"]: hexA(a.accent, 0.5),
        } as React.CSSProperties
      }
    >
      {active && (
        <span
          className="absolute bottom-1 left-0 top-1 w-0.5 rounded-full"
          style={{ background: a.accent }}
        />
      )}
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px] font-semibold"
        style={{ background: hexA(a.accent, 0.16), color: a.accent }}
      >
        {a.glyph}
      </span>
      <span className="truncate">{a.name}</span>
    </Link>
  );
}

export default function Shell({
  nav,
  children,
}: {
  nav: NavAgent[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [clock, setClock] = useState("");
  const agentNavRef = useEdgeAutoScroll<HTMLElement>();

  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toLocaleTimeString([], { hour12: false })),
      1000
    );
    setClock(new Date().toLocaleTimeString([], { hour12: false }));
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden h-screen w-[264px] shrink-0 flex-col border-r px-4 py-5 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-3 px-2">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-base font-bold"
            style={{
              background: hexA("#46e0d0", 0.14),
              color: "var(--color-signal)",
              boxShadow: `inset 0 0 0 1px ${hexA("#46e0d0", 0.3)}`,
            }}
          >
            ◎
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Mission Control
            </div>
            <div className="text-[11px] text-[var(--color-ink-4)]">
              agent fleet console
            </div>
          </div>
        </Link>

        <nav className="flex flex-col gap-1">
          <NavLink href="/" active={pathname === "/"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ⬚
            </span>
            Overview
          </NavLink>
          <NavLink href="/sessions" active={pathname === "/sessions"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ⧉
            </span>
            Sessions
          </NavLink>
          <NavLink href="/memory" active={pathname === "/memory"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ✦
            </span>
            Memory Vault
          </NavLink>
          <NavLink href="/meeting" active={pathname === "/meeting"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ❂
            </span>
            Team Meeting
          </NavLink>
          <NavLink href="/settings" active={pathname === "/settings"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ⚙
            </span>
            Settings · Routing
          </NavLink>
          <NavLink href="/logs" active={pathname === "/logs"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ▤
            </span>
            Logs
          </NavLink>
        </nav>

        <div className="mt-6 mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-4)]">
          Coding Agents
        </div>
        <nav ref={agentNavRef} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {nav.map((a) => (
            <AgentNav
              key={a.id}
              a={a}
              active={pathname === `/agents/${a.id}`}
            />
          ))}
        </nav>

        <div className="mt-4 flex shrink-0 items-center justify-between border-t pt-4 text-[11px] text-[var(--color-ink-4)]">
          <span className="flex items-center gap-1.5">
            <span
              className="mc-live-dot inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--color-green)" }}
            />
            online
          </span>
          <span className="mc-stat-value">{clock}</span>
        </div>
      </aside>

      <main className="h-screen min-w-0 flex-1 overflow-hidden">
        <RouteTransition>{children}</RouteTransition>
      </main>
    </div>
  );
}
