"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Bootstrap } from "@/lib/contracts";

const Context = createContext<{ data: Bootstrap | null; error: Error | null; reload: () => Promise<void> } | null>(null);

export function MarketplaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const reload = useCallback(async () => {
    try { setData(await api<Bootstrap>("bootstrap")); setError(null); }
    catch (failure) { setError(failure instanceof Error ? failure : new Error(String(failure))); }
  }, []);
  useEffect(() => {
    void reload();
    const refresh = () => { if (document.visibilityState === "visible") void reload(); };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [reload]);
  useEffect(() => { if (data) document.documentElement.style.setProperty("--accent", data.settings.accentColor); }, [data]);
  return <Context.Provider value={{ data, error, reload }}>{children}</Context.Provider>;
}

export function useMarketplace() {
  const context = useContext(Context);
  if (!context) throw new Error("MarketplaceProvider is required.");
  return context;
}

export function useResource<Result>(path: string | null) {
  const { data: bootstrap } = useMarketplace();
  const identity = `${bootstrap?.actor?.id}:${bootstrap?.actor?.role}`;
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (path === null) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true); setError(null);
    api<Result>(path, { signal: controller.signal }).then((result) => { setData(result); setLoading(false); }).catch((failure) => {
      if (!controller.signal.aborted) { setData(null); setError(failure instanceof Error ? failure : new Error(String(failure))); setLoading(false); }
    });
    return () => controller.abort();
  }, [path, identity, revision]);
  return { data, error, loading, reload, setData };
}