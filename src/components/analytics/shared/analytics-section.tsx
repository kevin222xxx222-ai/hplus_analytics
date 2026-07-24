import type { ReactNode } from "react";
export function AnalyticsSection({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="analytics-section" aria-labelledby={`analytics-section-${title}`}><div className="analytics-section-heading"><div><h2 id={`analytics-section-${title}`}>{title}</h2>{description ? <p className="muted">{description}</p> : null}</div>{action}</div>{children}</section>;
}

export const AnalyticsSharedSection = AnalyticsSection;
