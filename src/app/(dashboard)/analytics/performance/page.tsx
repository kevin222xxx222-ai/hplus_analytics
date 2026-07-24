import { PerformanceFunnelPage } from "@/components/analytics/performance-funnel-page";
import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { resolveDateRange } from "@/lib/analytics/cti";

export default async function PerformancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string }> }) {
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  const store = query.store === "KASUKABE" || query.store === "KOSHIGAYA" ? query.store : "ALL";
  return <AnalyticsPageLayout layoutOnly><PerformanceFunnelPage initialFrom={range.fromText} initialTo={range.toText} initialStore={store} /></AnalyticsPageLayout>;
}
