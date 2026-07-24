export class AnalyticsFetchError extends Error { constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = "AnalyticsFetchError"; } }
export async function fetchAnalyticsJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new AnalyticsFetchError(body.error ?? `HTTP ${response.status}`, response.status, body.code);
  return body as T;
}
