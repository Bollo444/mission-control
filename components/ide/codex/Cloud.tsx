"use client";

import { CliPanel } from "./_ui";

export default function CodexCloud() {
  return <CliPanel title="Codex Cloud" url="/api/codex/cloud" hint="Tasks from Codex Cloud (experimental). Empty/error if cloud isn't set up." />;
}
