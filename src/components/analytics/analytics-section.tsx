import type { ReactNode } from "react";

export function AnalyticsSection({ title, description, period, action, children }: { title: string; description?: string; period?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="mt-6 min-w-0" aria-labelledby={`analytics-section-${title}`}><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h2 id={`analytics-section-${title}`} className="text-lg font-bold text-slate-900">{title}</h2>{description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}{period && <p className="mt-1 text-xs text-slate-500">対象期間: {period}</p>}</div>{action && <div className="shrink-0">{action}</div>}</div>{children}</section>;
}
