import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { TimeAnalyticsPage } from "@/components/analytics/time-analytics-page";
import { resolveDateRange } from "@/lib/analytics/cti";

export default async function TimePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string }> }) {
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  const store = query.store === "KASUKABE" || query.store === "KOSHIGAYA" ? query.store : "ALL";
  return <AnalyticsPageLayout layoutOnly><TimeAnalyticsPage initialFrom={range.fromText} initialTo={range.toText} initialStore={store} /></AnalyticsPageLayout>;
}
