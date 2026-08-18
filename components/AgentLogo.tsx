"use client";

import { getSkin } from "./skins";

/* Official agent logos where we have real brand assets, falling back to the
 * bespoke animated mascot everywhere else. Add an emblem file under
 * public/emblems/<id>.(svg|png) and list it here to make an agent "official". */

// All agents use original mascots we drew - no third-party brand logos.
// Add an id/file here only if you ever vendor an official asset.
const EMBLEM_FILES: Record<string, string> = {};

export default function AgentLogo({
  id,
  size = 56,
  className = "",
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const file = EMBLEM_FILES[id];
  const { Mascot } = getSkin(id);
  if (file) {
    return (
      <img
        src={file}
        alt=""
        aria-hidden
        className={`object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Mascot size={size} className={className} />;
}
