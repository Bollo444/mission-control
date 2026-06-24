"use client";

import { useEffect, useState } from "react";
import type { ArtifactsResp, ArtifactCategory, ArtifactItem } from "./types";

const OX = {
  base: "#08080a",
  surface: "#121214",
  surface2: "#1b1b1e",
  line: "#2c2c30",
  gold: "#f5b75a",
  ink: "#f3e6d8",
  inkDim: "#c9a98f",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type ArtifactKind = "image" | "audio" | "text" | "other";

function kindOf(name: string): ArtifactKind {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"].includes(ext)) return "image";
  if ([".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(ext)) return "audio";
  if (
    [".md", ".txt", ".log", ".json", ".yaml", ".yml", ".csv", ".html", ".xml", ".py", ".ts", ".js"].includes(ext)
  )
    return "text";
  return "other";
}

function artifactUrl(p: string, download = false): string {
  return `/api/hermes/artifact?path=${encodeURIComponent(p)}${download ? "&download=1" : ""}`;
}

function ArtifactPreviewModal({ item, onClose }: { item: ArtifactItem; onClose: () => void }) {
  const kind = kindOf(item.name);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (kind !== "text") return;
    fetch(artifactUrl(item.path))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(setText)
      .catch((e: Error) => setError(e.message));
  }, [item.path, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-6"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        style={{ background: OX.surface, border: `1px solid ${OX.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-3"
          style={{ borderBottom: `1px solid ${OX.line}` }}
        >
          <div className="truncate text-sm font-medium" style={{ color: OX.ink }} title={item.path}>
            {item.name}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a
              href={artifactUrl(item.path, true)}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: OX.surface2, color: OX.gold, border: `1px solid ${OX.line}` }}
            >
              Download
            </a>
            <button
              onClick={onClose}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{ background: OX.surface2, color: OX.inkDim, border: `1px solid ${OX.line}` }}
            >
              Close
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={artifactUrl(item.path)} alt={item.name} className="mx-auto max-h-full max-w-full" />
          )}
          {kind === "audio" && (
            <audio src={artifactUrl(item.path)} controls className="w-full">
              audio preview unsupported
            </audio>
          )}
          {kind === "text" && (
            <>
              {error && (
                <p className="text-center text-xs" style={{ color: "#e05c5c" }}>
                  ⚠ {error}
                </p>
              )}
              {!error && text === null && (
                <p className="text-center text-xs" style={{ color: OX.inkDim }}>
                  Loading…
                </p>
              )}
              {text !== null && (
                <pre
                  className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed"
                  style={{ color: OX.ink, margin: 0 }}
                >
                  {text}
                </pre>
              )}
            </>
          )}
          {kind === "other" && (
            <p className="py-8 text-center text-sm" style={{ color: OX.inkDim }}>
              No inline preview for this file type. Use Download to open it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtifactRow({ item, onOpen }: { item: ArtifactItem; onOpen: (i: ArtifactItem) => void }) {
  return (
    <button
      onClick={() => onOpen(item)}
      title="Open preview"
      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-[rgba(245,183,90,0.06)]"
      style={{ borderBottom: `1px solid ${OX.line}` }}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium" style={{ color: OX.ink }}>
          {item.name}
        </div>
        <div
          className="truncate font-mono text-[11px]"
          style={{ color: OX.inkDim }}
          title={item.path}
        >
          {item.path}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs" style={{ color: OX.inkDim }}>
          {formatSize(item.size)}
        </div>
        <div className="text-[11px]" style={{ color: OX.inkDim }}>
          {relativeTime(item.mtime)}
        </div>
      </div>
    </button>
  );
}

function CategorySection({
  cat,
  onOpen,
}: {
  cat: ArtifactCategory;
  onOpen: (i: ArtifactItem) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-3">
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
            {cat.count}
          </span>
        </div>
        <span className="text-[11px]" style={{ color: OX.inkDim }}>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div>
          {[...cat.items]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((item) => (
              <ArtifactRow key={item.path} item={item} onOpen={onOpen} />
            ))}
        </div>
      )}
    </div>
  );
}

export default function Artifacts() {
  const [data, setData] = useState<ArtifactsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<ArtifactItem | null>(null);

  useEffect(() => {
    fetch("/api/hermes/artifacts")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ArtifactsResp>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: OX.inkDim }}>
        Loading artifacts…
      </p>
    );
  }

  if (error) {
    return (
      <p className="py-12 text-center text-sm" style={{ color: "#e05c5c" }}>
        ⚠ {error}
      </p>
    );
  }

  if (!data || data.categories.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-xs text-center">
          <div
            className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              background: "rgba(245,183,90,0.08)",
              boxShadow: `inset 0 0 0 1px rgba(245,183,90,0.20)`,
            }}
          >
            <span className="text-2xl">◻</span>
          </div>
          <p className="text-sm" style={{ color: OX.inkDim }}>
            No artifacts yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto">
      {[...data.categories]
        .sort((a, b) => a.category.localeCompare(b.category))
        .map((cat) => (
          <CategorySection key={cat.category} cat={cat} onOpen={setOpen} />
        ))}
      {open && <ArtifactPreviewModal item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
