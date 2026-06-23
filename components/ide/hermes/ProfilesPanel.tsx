"use client";

import { useEffect, useState } from "react";
import type { ProfilesResp, Profile } from "./types";

const OX = {
  base: "#08080a",
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  goldBright: "#ffd483",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};

function ProfileRow({ profile }: { profile: Profile }) {
  return (
    <div
      className="py-2.5"
      style={{ borderBottom: `1px solid ${OX.line}` }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-0.5">
        <span className="text-sm font-semibold" style={{ color: OX.ink }}>
          {profile.name}
        </span>
        {profile.isDefault && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: "rgba(245,183,90,0.15)",
              color: OX.goldBright,
              border: `1px solid rgba(245,183,90,0.40)`,
            }}
          >
            default
          </span>
        )}
      </div>
      {profile.description && (
        <p className="text-xs leading-relaxed mb-1" style={{ color: OX.inkDim }}>
          {profile.description}
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="font-mono text-[11px]"
          style={{ color: OX.inkDim }}
        >
          {profile.model}
        </span>
        {profile.soul && (
          <>
            <span style={{ color: OX.line }}>·</span>
            <span className="text-[11px]" style={{ color: OX.inkDim }}>
              soul: {profile.soul}
            </span>
          </>
        )}
        <span style={{ color: OX.line }}>·</span>
        <span className="text-[11px]" style={{ color: OX.inkDim }}>
          {profile.skillCount} skill{profile.skillCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

export default function ProfilesPanel() {
  const [data, setData] = useState<ProfilesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/hermes/profiles")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ProfilesResp>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${OX.line}` }}
      >
        <div
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ color: OX.inkDim }}
        >
          Profiles
        </div>
        {data && data.active > 0 && (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
            style={{
              background: "rgba(245,183,90,0.15)",
              color: OX.gold,
              border: `1px solid rgba(245,183,90,0.35)`,
            }}
          >
            {data.active} active
          </span>
        )}
      </div>

      <div className="px-4">
        {loading && (
          <p className="py-4 text-center text-xs" style={{ color: OX.inkDim }}>
            Loading…
          </p>
        )}
        {error && (
          <p className="py-4 text-center text-xs" style={{ color: "#e05c5c" }}>
            ⚠ {error}
          </p>
        )}
        {!loading && !error && data && data.profiles.length === 0 && (
          <p className="py-4 text-center text-xs" style={{ color: OX.inkDim }}>
            No profiles configured.
          </p>
        )}
        {!loading &&
          !error &&
          data &&
          data.profiles.map((p) => <ProfileRow key={p.name} profile={p} />)}
      </div>

      {/* Contextual note — helps the user understand the concept */}
      {data && data.profiles.length > 0 && (
        <div
          className="px-4 py-2.5"
          style={{ borderTop: `1px solid ${OX.line}` }}
        >
          <p className="text-[11px] leading-relaxed" style={{ color: OX.inkDim }}>
            Each spawned subagent runs as a separate profile + identity. More profiles = more
            parallel identities Hermes can become.
          </p>
        </div>
      )}
    </div>
  );
}
