import type { ReactNode } from "react";
import { localizeAnalyticsLabel } from "./analytics-labels";
export function AnalyticsSection({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  const localizedTitle = localizeAnalyticsLabel(title);
  return <section className="analytics-section" aria-labelledby={`analytics-section-${title}`}><div className="analytics-section-heading"><div><h2 id={`analytics-section-${title}`}>{localizedTitle}</h2>{description ? <p className="muted">{localizeAnalyticsLabel(description)}</p> : null}</div>{action}</div>{children}</section>;
}

export const AnalyticsSharedSection = AnalyticsSection;
