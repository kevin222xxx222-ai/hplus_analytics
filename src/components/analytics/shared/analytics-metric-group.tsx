import { AnalyticsKpiCard } from "@/components/analytics/analytics-kpi-card";
import type { ReactNode } from "react";
type Metric = { key: string; label: string; value: ReactNode; hint?: string };
export function AnalyticsMetricGroup({ title, metrics }: { title: string; metrics: Metric[] }) {
  return <div className="analytics-metric-group"><h3>{title}</h3><div className="analytics-kpi-grid">{metrics.map((metric) => <AnalyticsKpiCard key={metric.key} label={metric.label} value={metric.value} description={metric.hint} />)}</div></div>;
}
