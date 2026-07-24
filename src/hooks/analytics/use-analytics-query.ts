"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAnalyticsJson } from "@/lib/analytics/shared";
import type { AnalyticsQueryState } from "@/lib/analytics/shared";

export function useAnalyticsQuery<T>(url: string): AnalyticsQueryState<T> {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [status, setStatus] = useState(""); const requestId = useRef(0); const controller = useRef<AbortController | null>(null);
  const retry = useCallback(() => { controller.current?.abort(); const next = new AbortController(); controller.current = next; const id = ++requestId.current; setLoading(true); setError(null); setStatus("分析データを取得中"); void fetchAnalyticsJson<T>(url, next.signal).then((result) => { if (id !== requestId.current) return; setData(result); setStatus("分析データを表示中"); }).catch((cause) => { if (cause instanceof DOMException && cause.name === "AbortError") return; if (id === requestId.current) { setError(cause instanceof Error ? cause.message : "分析データを取得できませんでした。"); setStatus(""); } }).finally(() => { if (id === requestId.current) setLoading(false); }); }, [url]);
  useEffect(() => { const timer = window.setTimeout(retry, 0); return () => { window.clearTimeout(timer); controller.current?.abort(); }; }, [retry]);
  return { data, loading, error, status, retry };
}
