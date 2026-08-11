import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { WeekdayStrategyPage } from "@/components/analytics/weekday-strategy-page";
import { resolveDateRange } from "@/lib/analytics/cti";
import { getWeekdayDataRange, type WeekdayScope } from "@/lib/analytics/weekday-strategy";

export default async function TimePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string }> }) {
  const query = await searchParams;
  const store = query.store === "KASUKABE" || query.store === "KOSHIGAYA" ? query.store : "ALL";
  const hasExplicitRange = Boolean(query.from || query.to);
  const scope = store as WeekdayScope;
  const availableRange = hasExplicitRange ? null : await getWeekdayDataRange(scope);
  const resolved = hasExplicitRange ? resolveDateRange(query.from, query.to) : null;
  const initialFrom = availableRange?.from ?? resolved?.fromText ?? "";
  const initialTo = availableRange?.to ?? resolved?.toText ?? "";
  return <AnalyticsPageLayout layoutOnly><WeekdayStrategyPage initialFrom={initialFrom} initialTo={initialTo} initialScope={store} initialAutoRange={!hasExplicitRange} /></AnalyticsPageLayout>;
}
