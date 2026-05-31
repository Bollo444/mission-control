"use client";

import { usePathname } from "next/navigation";

/* Replays a distinct, identity-themed entrance animation on every tab switch.
   Keyed by pathname so navigating remounts the wrapper and re-fires the CSS. */

const AGENT_ENTER: Record<string, string> = {
  claude: "mc-enter-ember",
  hermes: "mc-enter-shimmer",
  pi: "mc-enter-wipe",
  opencode: "mc-enter-iris",
  antigravity: "mc-enter-warp",
  openclaw: "mc-enter-slash",
  jcode: "mc-enter-zoom",
  vibe: "mc-enter-pulse",
  kilo: "mc-enter-fold",
};

const ROUTE_ENTER: Record<string, string> = {
  "/": "mc-enter-zoom",
  "/sessions": "mc-enter-wipe",
  "/memory": "mc-enter-iris",
  "/meeting": "mc-enter-warp",
  "/settings": "mc-enter-fold",
};

function enterClass(pathname: string): string {
  if (pathname.startsWith("/agents/")) {
    const id = pathname.split("/")[2] ?? "";
    return AGENT_ENTER[id] ?? "mc-enter-rise";
  }
  return ROUTE_ENTER[pathname] ?? "mc-enter-rise";
}

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={`h-full overflow-hidden ${enterClass(pathname)}`}>
      {children}
    </div>
  );
}
