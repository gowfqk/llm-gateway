import { useState, useEffect } from "react";
import type { Provider, UsageRecord, RouteRule } from "@/types";
import { loadProviders, loadUsageRecords, loadRoutes, computeDailyUsage } from "@/lib/store";

export function useProviders() {
  const [data, setData] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    const d = await loadProviders();
    setData(d);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  return { data, loading, setData, refresh };
}

export function useUsage() {
  const [data, setData] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsageRecords().then((d) => { setData(d); setLoading(false); });
  }, []);

  return { data, loading, setData };
}

export function useRoutes() {
  const [data, setData] = useState<RouteRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRoutes().then((d) => { setData(d); setLoading(false); });
  }, []);

  return { data, loading, setData };
}

export function useDailyUsage(usage: UsageRecord[]) {
  const [data, setData] = useState<ReturnType<typeof computeDailyUsage>>([]);

  useEffect(() => {
    if (usage.length > 0) {
      setData(computeDailyUsage(usage));
    }
  }, [usage]);

  return data;
}
