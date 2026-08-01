"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import type { NavAgent } from "@/lib/types";
import { hexA } from "@/lib/format";
import RouteTransition from "./RouteTransition";
import { useEdgeAutoScroll } from "./useEdgeAutoScroll";
import EdgeFileDrawer from "./EdgeFileDrawer";
import { useTheme } from "@/lib/theme";

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
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{a.name}</span>
        {a.id === "cline" && (
          /* Tiny real Cline emblem beside the name (sits next to the colored
             glyph badge so the row stays balanced). */
          <img
            src="/emblems/cline.png"
            alt=""
            aria-hidden
            className="h-3.5 w-3.5 shrink-0 select-none opacity-90"
          />
        )}
      </span>
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
  const [open, setOpen] = useState(true);
  const agentNavRef = useEdgeAutoScroll<HTMLElement>();
  const { currentTheme } = useTheme();

  // Create theme-aware nav with current theme's agent accents
  const themedNav = useMemo(() =>
    nav.map((a) => ({
      ...a,
      accent: currentTheme.agentAccents[a.id] ?? currentTheme.signal,
    })),
    [nav, currentTheme]
  );

  // Default: sidebar open on desktop, collapsed on mobile.
  useEffect(() => {
    setOpen(window.matchMedia("(min-width: 768px)").matches);
  }, []);

  // On mobile, navigating to a page closes the drawer.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      setOpen(false);
    }
  }, [pathname]);

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
      {/* Floating opener — visible whenever the sidebar is hidden (desktop or mobile). */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Show sidebar"
          title="Show sidebar"
          className="fixed left-3 top-3 z-[60] grid h-10 w-10 place-items-center rounded-xl border bg-[var(--color-surface)] text-lg text-[var(--color-ink-2)] shadow-lg transition-colors hover:bg-[var(--color-surface-3)]"
        >
          ☰
        </button>
      )}

      {/* Mobile backdrop — tap to dismiss the drawer. */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[270px] max-w-[85vw] shrink-0 flex-col border-r bg-[var(--color-bg)] px-4 py-5 transition-transform duration-200 ${
          open ? "translate-x-0 md:static md:z-auto md:max-w-none" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between gap-2 px-2">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base font-bold"
              style={{
                background: hexA(currentTheme.signal, 0.14),
                color: "var(--color-signal)",
                boxShadow: `inset 0 0 0 1px ${hexA(currentTheme.signal, 0.3)}`,
              }}
            >
              ◎
            </span>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-tight">
                Mission Control
              </div>
              <div className="truncate text-[11px] text-[var(--color-ink-4)]">
                agent fleet console
              </div>
            </div>
          </Link>
          <button
            onClick={() => setOpen(false)}
            aria-label="Hide sidebar"
            title="Hide sidebar"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg text-[var(--color-ink-4)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
          >
            ‹
          </button>
        </div>

        <nav className="flex flex-col gap-1">
          <NavLink href="/" active={pathname === "/"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ◎
            </span>
            Command
          </NavLink>
          <NavLink href="/overview" active={pathname === "/overview"}>
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
          <NavLink href="/automation" active={pathname === "/automation"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ⏱
            </span>
            Automation
          </NavLink>
          <NavLink href="/settings" active={pathname === "/settings"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ⚙
            </span>
            Settings · Routing
          </NavLink>
          <NavLink href="/gateway" active={pathname === "/gateway"}>
            <span className="grid h-6 w-6 place-items-center rounded-md text-[13px]">
              ⇄
            </span>
            Fleet Gateway
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
        <nav
          ref={agentNavRef}
          className="-mr-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
        >
          {themedNav.map((a) => (
            <AgentNav key={a.id} a={a} active={pathname === `/agents/${a.id}`} />
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

      {/* Hover the right edge of the window to reveal system files. */}
      <EdgeFileDrawer />
    </div>
  );
}
