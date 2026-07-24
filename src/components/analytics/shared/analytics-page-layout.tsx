import type { ReactNode } from "react";
import { AnalyticsHeader } from "./analytics-header";
import { AnalyticsLoadingState, AnalyticsErrorMessage } from "./analytics-state";
export function AnalyticsPageLayout({ title, description, eyebrow, period, storeLabel, toolbar, children, loading = false, error, onRetry, layoutOnly = false }: { title?: string; description?: string; eyebrow?: string; period?: string; storeLabel?: string; toolbar?: ReactNode; children: ReactNode; loading?: boolean; error?: string | null; onRetry?: () => void; layoutOnly?: boolean }) {
  if (layoutOnly) return <main className="analytics-page" aria-busy={loading}>{children}</main>;
  return <main className="analytics-page" aria-busy={loading}><AnalyticsHeader eyebrow={eyebrow} title={title ?? "Analytics"} description={description} period={period} storeLabel={storeLabel} loading={loading} onRefresh={onRetry} />{toolbar ? <div className="analytics-page-toolbar">{toolbar}</div> : null}{error ? <AnalyticsErrorMessage message={error} onRetry={onRetry ?? (() => undefined)} /> : loading ? <AnalyticsLoadingState /> : children}</main>;
}
