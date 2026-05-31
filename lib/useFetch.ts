"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useFetch<T>(url: string, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      if (mounted.current) {
        setData(json);
        setError(null);
      }
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    load();
    let timer: ReturnType<typeof setInterval> | undefined;
    if (intervalMs) timer = setInterval(load, intervalMs);
    return () => {
      mounted.current = false;
      if (timer) clearInterval(timer);
    };
  }, [load, intervalMs]);

  return { data, error, loading, reload: load };
}
