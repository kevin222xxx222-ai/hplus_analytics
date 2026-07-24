import { TrendAnalyticsPage } from "@/components/analytics/trend-analytics-page";
import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { resolveDateRange } from "@/lib/analytics/cti";
import type { ComparisonKey } from "@/lib/analytics/ui/trend-view-model";

export default async function TrendPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string; comparison?: string }> }) {
  const query = await searchParams; const range = resolveDateRange(query.from, query.to);
  const store = query.store === "KASUKABE" || query.store === "KOSHIGAYA" ? query.store : "ALL";
  const allowed = ["previousDay", "previousWeek", "previousWeekday", "previousMonth", "previousMonthToDate"];
  const comparison = (allowed.includes(query.comparison ?? "") ? query.comparison : "previousMonthToDate") as ComparisonKey;
  return <AnalyticsPageLayout layoutOnly><TrendAnalyticsPage initialFrom={range.fromText} initialTo={range.toText} initialStore={store} initialComparison={comparison} /></AnalyticsPageLayout>;
}
