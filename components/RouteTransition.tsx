"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";

/* On every tab switch the content remounts (keyed by pathname) and plays a
   single FAST fade-in. Separately, a persistent, heavily-blurred color WASH
   layer (rendered outside the keyed wrapper, so it does not remount) blends
   SLOWLY from the previous route's accent to the new route's accent over
   ~900ms, then fades away. Fast motion + slow color is the intended contrast.
   Per-agent accents are preserved; only the global/default + generic routes
   are gold now. The wash never blocks pointer events. */

interface Trans {
  accent: string;
}

const GOLD = "#f5b75a";

const AGENTS: Record<string, Trans> = {
  claude: { accent: "#e0915f" },
  hermes: { accent: "#f5b75a" },
  pi: { accent: "#5cd6a0" },
  cline: { accent: "#9d8cff" },
  antigravity: { accent: "#6ea8fe" },
  zcode: { accent: "#f04d8b" },
  openclaw: { accent: "#ff4438" },
  jcode: { accent: "#46e0d0" },
  vibe: { accent: "#f06a7a" },
  sentinel: { accent: "#d65db1" },
};

const ROUTES: Record<string, Trans> = {
  "/": { accent: GOLD },
  "/sessions": { accent: GOLD },
  "/memory": { accent: GOLD },
  "/meeting": { accent: "#9d8cff" },
  "/settings": { accent: GOLD },
};

const DEFAULT: Trans = { accent: GOLD };

function transFor(pathname: string): Trans {
  if (pathname.startsWith("/agents/")) {
    const id = pathname.split("/")[2] ?? "";
    return AGENTS[id] ?? DEFAULT;
  }
  return ROUTES[pathname] ?? DEFAULT;
}

export default function RouteTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const accent = transFor(pathname).accent;

  // Remember the accent from the previous render so the outgoing wash layer
  // can fade out the old color while the new one fades in.
  const prevAccent = useRef<string>(accent);
  const outgoing = prevAccent.current;
  prevAccent.current = accent;

  return (
    <div className="relative h-full overflow-hidden">
      {/* Persistent slow color wash — lives outside the keyed wrapper so it
          never remounts; the two layers cross-blend on each navigation. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
        <div
          key={`out-${pathname}`}
          className="mc-wash-out absolute inset-0"
          style={{
            background: `radial-gradient(1200px 800px at 80% 0%, ${outgoing}, transparent 70%)`,
            filter: "blur(90px)",
          }}
        />
        <div
          key={`in-${pathname}`}
          className="mc-wash-in absolute inset-0"
          style={{
            background: `radial-gradient(1200px 800px at 80% 0%, ${accent}, transparent 70%)`,
            filter: "blur(90px)",
          }}
        />
      </div>

      {/* Fast content fade — remounts each route. */}
      <div key={pathname} className="mc-fade-in h-full overflow-hidden">
        {children}
      </div>
    </div>
  );
}
