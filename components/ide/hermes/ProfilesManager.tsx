"use client";

// Profiles tab — view every Hermes subagent profile and create new ones by hand.

import { useCallback, useEffect, useState } from "react";

const OX = {
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};

interface Profile {
  name: string;
  isDefault: boolean;
  description: string;
  model: string | null;
  soul: string | null;
  skillCount: number;
}

export default function ProfilesManager() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [soul, setSoul] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/hermes/profiles")
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setProfiles(j.profiles ?? [])))
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch("/api/hermes/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, model, soul }),
      });
      const j = await r.json();
      if (j.ok) {
        setName(""); setDescription(""); setModel(""); setSoul("");
        setNote(`Created “${name}”.`);
        load();
      } else setNote(j.error || "create failed");
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-lg border bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none";

  return (
    <div className="flex h-full min-h-0 gap-5 overflow-hidden">
      {/* Left — existing profiles */}
      <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto pr-1">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: OX.inkDim }}>
          Profiles {profiles ? `· ${profiles.length}` : ""}
        </div>
        {error && <p className="text-xs" style={{ color: "#ff6b6b" }}>⚠ {error}</p>}
        {!error && profiles === null && <p className="text-xs" style={{ color: OX.inkDim }}>Loading…</p>}
        {profiles?.map((p) => (
          <div key={p.name} className="mb-2 rounded-lg p-3" style={{ border: `1px solid ${OX.line}`, background: OX.surface }}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: OX.ink }}>{p.name}</span>
              {p.isDefault && (
                <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${OX.gold}22`, color: OX.gold }}>default</span>
              )}
              <span className="ml-auto text-[11px]" style={{ color: OX.inkDim }}>{p.skillCount} skills</span>
            </div>
            {p.description && <p className="mt-1 text-[12px]" style={{ color: OX.inkDim }}>{p.description}</p>}
            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px]" style={{ color: OX.inkDim }}>
              {p.model && <span>model: <span className="font-mono">{p.model}</span></span>}
              {p.soul && <span className="truncate">soul: {p.soul.slice(0, 60)}…</span>}
            </div>
          </div>
        ))}
        {profiles?.length === 0 && <p className="text-xs" style={{ color: OX.inkDim }}>No named profiles yet.</p>}
      </div>

      {/* Right — create */}
      <div className="flex w-1/2 min-w-0 flex-col overflow-y-auto pl-5" style={{ borderLeft: `1px solid ${OX.line}` }}>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: OX.inkDim }}>
          New subagent profile
        </div>
        <label className="mb-1 block text-[11px]" style={{ color: OX.inkDim }}>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. researcher" className={`${field} mb-3`} style={{ borderColor: OX.line, color: OX.ink }} />
        <label className="mb-1 block text-[11px]" style={{ color: OX.inkDim }}>Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="what this profile is for" className={`${field} mb-3`} style={{ borderColor: OX.line, color: OX.ink }} />
        <label className="mb-1 block text-[11px]" style={{ color: OX.inkDim }}>Default model <span style={{ opacity: 0.6 }}>(optional)</span></label>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. auto" className={`${field} mb-3 font-mono`} style={{ borderColor: OX.line, color: OX.ink }} />
        <label className="mb-1 block text-[11px]" style={{ color: OX.inkDim }}>Soul / identity <span style={{ opacity: 0.6 }}>(optional, SOUL.md)</span></label>
        <textarea value={soul} onChange={(e) => setSoul(e.target.value)} rows={4} placeholder="the persona / standing instructions for this subagent" className={`${field} mb-3 resize-y`} style={{ borderColor: OX.line, color: OX.ink }} />
        <div className="flex items-center gap-2">
          <button onClick={create} disabled={busy || !name.trim()} className="rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40" style={{ background: OX.gold, color: "#1a1206" }}>
            {busy ? "Creating…" : "Create profile"}
          </button>
          {note && <span className="text-xs" style={{ color: OX.inkDim }}>{note}</span>}
        </div>
      </div>
    </div>
  );
}
