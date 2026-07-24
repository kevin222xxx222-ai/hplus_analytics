import type { FormEvent, ReactNode } from "react";

export function AnalyticsFilterBar({ children, onSubmit, submitLabel = "適用" }: { children: ReactNode; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; submitLabel?: string }) {
  return <form className="analytics-filter-bar" onSubmit={onSubmit} role="search"><div className="analytics-filter-fields">{children}</div>{onSubmit ? <button type="submit" className="primary-button">{submitLabel}</button> : null}</form>;
}
