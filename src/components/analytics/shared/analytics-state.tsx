import { AnalyticsEmptyState } from "@/components/analytics/analytics-empty-state";
import { AnalyticsErrorState } from "@/components/analytics/analytics-error-state";
import { AnalyticsSkeleton } from "@/components/analytics/analytics-skeleton";
import { AnalyticsUnavailableState } from "@/components/analytics/analytics-unavailable-state";
export function AnalyticsLoadingState() { return <div aria-busy="true"><AnalyticsSkeleton /></div>; }
export function AnalyticsErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div><AnalyticsErrorState message={message} />{onRetry ? <button type="button" className="secondary-button mt-3" onClick={onRetry}>再試行</button> : null}</div>; }
export function AnalyticsEmptyMessage({ message }: { message?: string }) { return <AnalyticsEmptyState description={message} />; }
export function AnalyticsUnavailableMessage({ message }: { message?: string }) { return <AnalyticsUnavailableState description={message} />; }
