"use client";

import { useEffect, useState } from "react";
import Toggle from "./Toggle";
import type { ToolsetsResp, SkillsResp, Toolset, Skill, SkillCategory } from "./types";

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

type PickerTab = "toolsets" | "skills";

// ---- Toggle wrapper that POSTs optimistically ---------------------------

function ToolsetRow({ toolset }: { toolset: Toolset }) {
  const [enabled, setEnabled] = useState(toolset.enabled);
  const [pending, setPending] = useState(false);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setPending(true);
    try {
      const res = await fetch("/api/hermes/toolsets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: toolset.name, enabled: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setEnabled(!next); // revert
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex items-start gap-3 py-3"
      style={{ borderBottom: `1px solid ${OX.line}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold" style={{ color: OX.ink }}>
            {toolset.name}
          </span>
          <code
            className="rounded px-1.5 py-0.5 font-mono text-[11px]"
            style={{ background: OX.surface2, color: OX.gold, border: `1px solid ${OX.line}` }}
            title="launches in real-time during the conversation"
          >
            @{toolset.keyword}
          </code>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: OX.inkDim }}>
          {toolset.description}
        </p>
        <span className="mt-1 inline-block text-[11px]" style={{ color: OX.inkDim }}>
          {toolset.toolCount} tool{toolset.toolCount !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle on={enabled} onChange={toggle} disabled={pending} />
      </div>
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  const [enabled, setEnabled] = useState(skill.enabled);
  const [pending, setPending] = useState(false);

  const toggle = async (next: boolean) => {
    setEnabled(next);
    setPending(true);
    try {
      const res = await fetch("/api/hermes/skills", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skill: skill.name, enabled: next }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setEnabled(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="flex items-start gap-3 py-2.5"
      style={{ borderBottom: `1px solid ${OX.line}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-sm font-semibold" style={{ color: OX.ink }}>
          {skill.name}
        </div>
        <p className="text-xs leading-relaxed" style={{ color: OX.inkDim }}>
          {skill.description}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">
        <Toggle on={enabled} onChange={toggle} disabled={pending} />
      </div>
    </div>
  );
}

function CategorySection({ cat }: { cat: SkillCategory }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2 text-left"
        style={{ borderBottom: `1px solid ${OX.line}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: OX.inkDim }}
          >
            {cat.category}
          </span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: OX.surface2, color: OX.gold, border: `1px solid ${OX.line}` }}
          >
            {cat.installed}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: OX.inkDim }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div>
          {[...cat.skills].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <SkillRow key={s.name} skill={s} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Main component -----------------------------------------------------

export default function SkillsAndTools() {
  const [pick, setPick] = useState<PickerTab>("toolsets");
  const [toolsetsData, setToolsetsData] = useState<ToolsetsResp | null>(null);
  const [skillsData, setSkillsData] = useState<SkillsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = pick === "toolsets" ? "/api/hermes/toolsets" : "/api/hermes/skills";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (pick === "toolsets") setToolsetsData(data as ToolsetsResp);
        else setSkillsData(data as SkillsResp);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [pick]);

  const PICKER_TABS: { id: PickerTab; label: string }[] = [
    { id: "toolsets", label: "Tool sets" },
    { id: "skills", label: "Skills" },
  ];

  return (
    <div className="flex h-full min-h-0 gap-5">
      {/* Left picker */}
      <div
        className="flex w-36 shrink-0 flex-col gap-1 pt-1"
        style={{ borderRight: `1px solid ${OX.line}`, paddingRight: "16px" }}
      >
        <div
          className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: OX.inkDim }}
        >
          Browse
        </div>
        {PICKER_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setPick(id)}
            className="rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors"
            style={
              pick === id
                ? { background: OX.surface2, color: OX.gold, border: `1px solid ${OX.line}` }
                : { color: OX.inkDim, border: "1px solid transparent" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Right content */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {/* Toolsets view */}
        {pick === "toolsets" && (
          <div>
            {toolsetsData && (
              <div className="mb-4 flex items-baseline gap-2">
                <span
                  className="font-serif text-3xl font-semibold"
                  style={{ color: OX.gold }}
                >
                  {toolsetsData.enabled}
                  <span className="text-xl" style={{ color: OX.inkDim }}>
                    {" "}/ {toolsetsData.installed}
                  </span>
                </span>
                <span className="text-sm" style={{ color: OX.inkDim }}>
                  tool sets enabled
                </span>
              </div>
            )}
            {loading && (
              <p className="py-8 text-center text-sm" style={{ color: OX.inkDim }}>
                Loading tool sets…
              </p>
            )}
            {error && (
              <p className="py-8 text-center text-sm" style={{ color: "#e05c5c" }}>
                ⚠ {error}
              </p>
            )}
            {!loading && !error && toolsetsData && toolsetsData.toolsets.length === 0 && (
              <p className="py-8 text-center text-sm" style={{ color: OX.inkDim }}>
                No tool sets installed.
              </p>
            )}
            {!loading &&
              !error &&
              toolsetsData &&
              [...toolsetsData.toolsets]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((ts) => <ToolsetRow key={ts.name} toolset={ts} />)}
          </div>
        )}

        {/* Skills view */}
        {pick === "skills" && (
          <div>
            {skillsData && (
              <div className="mb-4 flex items-baseline gap-2">
                <span
                  className="font-serif text-3xl font-semibold"
                  style={{ color: OX.gold }}
                >
                  {skillsData.totalEnabled}
                  <span className="text-xl" style={{ color: OX.inkDim }}>
                    {" "}/ {skillsData.totalInstalled}
                  </span>
                </span>
                <span className="text-sm" style={{ color: OX.inkDim }}>
                  skills enabled
                </span>
              </div>
            )}
            {loading && (
              <p className="py-8 text-center text-sm" style={{ color: OX.inkDim }}>
                Loading skills…
              </p>
            )}
            {error && (
              <p className="py-8 text-center text-sm" style={{ color: "#e05c5c" }}>
                ⚠ {error}
              </p>
            )}
            {!loading && !error && skillsData && skillsData.categories.length === 0 && (
              <p className="py-8 text-center text-sm" style={{ color: OX.inkDim }}>
                No skills installed.
              </p>
            )}
            {!loading &&
              !error &&
              skillsData &&
              [...skillsData.categories]
                .sort((a, b) => a.category.localeCompare(b.category))
                .map((cat) => <CategorySection key={cat.category} cat={cat} />)}
          </div>
        )}
      </div>
    </div>
  );
}
