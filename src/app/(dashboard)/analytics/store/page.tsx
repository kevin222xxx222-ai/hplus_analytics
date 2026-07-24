import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { StoreAnalyticsPage } from "@/components/analytics/store-analytics-page";
import { resolveDateRange } from "@/lib/analytics/cti";

export default async function StorePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string }> }) {
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  const store = ["ALL", "KASUKABE", "KOSHIGAYA", "NODA"].includes(query.store ?? "") ? query.store ?? "ALL" : "ALL";
  return <AnalyticsPageLayout layoutOnly><StoreAnalyticsPage initialFrom={range.fromText} initialTo={range.toText} initialStore={store} /></AnalyticsPageLayout>;
}
