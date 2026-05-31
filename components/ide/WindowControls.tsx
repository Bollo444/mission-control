"use client";

/* Windows-style window caption buttons (minimize / maximize / close) pinned to
   the right of a title bar. Decorative — they mirror the native Windows chrome
   so the embedded surfaces read as Windows, not macOS. Close hovers red. */
export default function WindowControls() {
  return (
    <div className="ml-2 flex h-full items-stretch">
      <CaptionButton label="Minimize">
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
          <rect x="1" y="5.5" width="9" height="1" fill="currentColor" />
        </svg>
      </CaptionButton>
      <CaptionButton label="Maximize">
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
          <rect x="1.5" y="1.5" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </CaptionButton>
      <CaptionButton label="Close" close>
        <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
          <path d="M1 1 L10 10 M10 1 L1 10" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      </CaptionButton>
    </div>
  );
}

function CaptionButton({
  children,
  label,
  close,
}: {
  children: React.ReactNode;
  label: string;
  close?: boolean;
}) {
  return (
    <span
      role="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      className={`grid w-11 place-items-center text-[var(--color-ink-3)] transition-colors ${
        close ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-white/10 hover:text-[var(--color-ink)]"
      }`}
    >
      {children}
    </span>
  );
}
