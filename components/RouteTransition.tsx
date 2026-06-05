"use client";

import { usePathname } from "next/navigation";

/* On every tab switch this remounts (keyed by pathname) and fires two things:
   1) a content entrance animation on the page, and
   2) a themed color SWEEP overlay that plays regardless of how fast the page's
      data loads — so the transition is always visibly dramatic and distinct
      per agent. The overlay clears to transparent and never blocks clicks. */

interface Trans {
  enter: string;
  sweep: string;
  accent: string;
}

const AGENTS: Record<string, Trans> = {
  claude: { enter: "mc-enter-ember", sweep: "mc-sweep-across", accent: "#e0915f" },
  hermes: { enter: "mc-enter-shimmer", sweep: "mc-sweep-across", accent: "#f5b75a" },
  pi: { enter: "mc-enter-wipe", sweep: "mc-sweep-up", accent: "#5cd6a0" },
  opencode: { enter: "mc-enter-iris", sweep: "mc-sweep-iris", accent: "#9d8cff" },
  antigravity: { enter: "mc-enter-warp", sweep: "mc-sweep-across", accent: "#6ea8fe" },
  openclaw: { enter: "mc-enter-slash", sweep: "mc-sweep-diag", accent: "#ff4438" },
  jcode: { enter: "mc-enter-zoom", sweep: "mc-sweep-diag", accent: "#46e0d0" },
  vibe: { enter: "mc-enter-pulse", sweep: "mc-sweep-iris", accent: "#f06a7a" },
  kilo: { enter: "mc-enter-fold", sweep: "mc-sweep-up", accent: "#c0c6d4" },
  sentinel: { enter: "mc-enter-iris", sweep: "mc-sweep-diag", accent: "#d65db1" },
};

const ROUTES: Record<string, Trans> = {
  "/": { enter: "mc-enter-zoom", sweep: "mc-sweep-iris", accent: "#46e0d0" },
  "/sessions": { enter: "mc-enter-wipe", sweep: "mc-sweep-up", accent: "#46e0d0" },
  "/memory": { enter: "mc-enter-iris", sweep: "mc-sweep-iris", accent: "#46e0d0" },
  "/meeting": { enter: "mc-enter-warp", sweep: "mc-sweep-across", accent: "#9d8cff" },
  "/settings": { enter: "mc-enter-fold", sweep: "mc-sweep-up", accent: "#46e0d0" },
};

const DEFAULT: Trans = { enter: "mc-enter-rise", sweep: "mc-sweep-across", accent: "#46e0d0" };

function transFor(pathname: string): Trans {
  if (pathname.startsWith("/agents/")) {
    const id = pathname.split("/")[2] ?? "";
    return AGENTS[id] ?? DEFAULT;
  }
  return ROUTES[pathname] ?? DEFAULT;
}

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = transFor(pathname);
  return (
    <div key={pathname} className="relative h-full overflow-hidden">
      <div className={`h-full overflow-hidden ${t.enter}`}>{children}</div>
      <div
        aria-hidden
        className={`mc-route-sweep pointer-events-none absolute inset-0 z-40 ${t.sweep}`}
        style={{ ["--sweep" as string]: t.accent } as React.CSSProperties}
      />
    </div>
  );
}
