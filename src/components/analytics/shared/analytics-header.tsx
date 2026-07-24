import type { ReactNode } from "react";

type AnalyticsHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  period?: string;
  storeLabel?: string;
  updatedAt?: string;
  loading?: boolean;
  onRefresh?: () => void;
  actions?: ReactNode;
};

export function AnalyticsHeader({ eyebrow, title, description, period, storeLabel, updatedAt, loading = false, onRefresh, actions }: AnalyticsHeaderProps) {
  return (
    <header className="analytics-header" aria-busy={loading}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
        <div className="analytics-header-meta">
          {storeLabel ? <span>{storeLabel}</span> : null}
          {period ? <span>{period}</span> : null}
          {updatedAt ? <span>更新: {updatedAt}</span> : null}
        </div>
      </div>
      <div className="analytics-header-actions">
        {actions}
        {onRefresh ? <button type="button" className="secondary-button" onClick={onRefresh} disabled={loading}>{loading ? "更新中…" : "再読み込み"}</button> : null}
      </div>
      {loading ? <span className="sr-only" role="status">分析データを取得中</span> : null}
    </header>
  );
}
