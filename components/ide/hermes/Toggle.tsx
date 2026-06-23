"use client";

// Reusable gold toggle switch — themed with the OX palette.
// `on`  — controlled value
// `onChange` — called with the next boolean

const OX = {
  gold: "#f5b75a",
  base: "#08080a",
  line: "#2c2c30",
  inkDim: "#c9a98f",
};

interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export default function Toggle({ on, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: on ? OX.gold : OX.line,
        border: `1px solid ${on ? OX.gold : OX.line}`,
      }}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full transition-transform"
        style={{
          background: on ? OX.base : OX.inkDim,
          transform: on ? "translateX(18px)" : "translateX(2px)",
        }}
      />
    </button>
  );
}
