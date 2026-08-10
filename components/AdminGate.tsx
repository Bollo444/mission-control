"use client";

import { FormEvent, useEffect, useState } from "react";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { authenticated?: boolean; configured?: boolean }) => {
        setAuthenticated(Boolean(data.authenticated));
        if (data.configured === false) setError("Set MC_ADMIN_TOKEN before starting Mission Control.");
      })
      .catch(() => setError("Could not reach the authentication endpoint."))
      .finally(() => setReady(true));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setToken("");
      setAuthenticated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready || authenticated) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 text-[var(--color-ink)]">
      <section className="w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-8 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 text-xl text-[var(--color-signal)]">◎</div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-signal)]">Restricted control plane</p>
            <h1 className="text-xl font-semibold">Mission Control</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-[var(--color-ink-3)]">
          This console can launch processes, read workspace files, manage provider keys, and call external tools. Enter the configured admin token to establish an HttpOnly session.
        </p>
        <form onSubmit={login} className="space-y-3">
          <label className="block text-xs font-medium text-[var(--color-ink-2)]" htmlFor="mc-admin-token">Admin token</label>
          <input
            id="mc-admin-token"
            autoFocus
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="MC_ADMIN_TOKEN"
            className="w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-3 font-mono text-sm outline-none transition focus:border-[var(--color-signal)]"
          />
          {error && <p className="text-xs text-[var(--color-red)]">{error}</p>}
          <button
            type="submit"
            disabled={!token || submitting}
            className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-[#0b0c0f] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--color-signal)" }}
          >
            {submitting ? "Authenticating…" : "Enter Mission Control"}
          </button>
        </form>
      </section>
    </main>
  );
}
