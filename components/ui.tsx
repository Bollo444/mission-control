import Link from "next/link";
import { hexA } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  sub,
  accent = "var(--color-signal)",
  right,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b px-8 py-6">
      <div className="min-w-0">
        {eyebrow && (
          <div
            className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: accent }}
          >
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-3)]">{sub}</p>
        )}
      </div>
      {right}
    </div>
  );
}

export function StatusPill({
  on,
  labelOn = "active",
  labelOff = "not installed",
  accent = "var(--color-green)",
}: {
  on: boolean;
  labelOn?: string;
  labelOff?: string;
  accent?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: on ? hexA("#5cd6a0", 0.12) : "var(--color-surface-3)",
        color: on ? accent : "var(--color-ink-4)",
      }}
    >
      <span
        className={on ? "mc-live-dot" : ""}
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: on ? accent : "var(--color-ink-4)",
          display: "inline-block",
        }}
      />
      {on ? labelOn : labelOff}
    </span>
  );
}

export function Stat({
  value,
  unit,
  label,
}: {
  value: React.ReactNode;
  unit?: string;
  label: string;
}) {
  return (
    <div>
      <div className="mc-stat-value text-2xl leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-sm text-[var(--color-ink-4)]">{unit}</span>
        )}
      </div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wider text-[var(--color-ink-4)]">
        {label}
      </div>
    </div>
  );
}

export function Tag({ accent, children }: { accent: string; children: React.ReactNode }) {
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
      style={{ background: hexA(accent, 0.12), color: accent }}
    >
      {children}
    </span>
  );
}

export function Kind({ kind }: { kind: string }) {
  const map: Record<string, string> = { cli: "CLI", ide: "IDE", framework: "Framework" };
  return (
    <span className="rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-3)]">
      {map[kind] ?? kind}
    </span>
  );
}

export function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="text-[var(--color-signal)] underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}
