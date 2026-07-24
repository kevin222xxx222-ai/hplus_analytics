import { resolveDateRange } from "@/lib/analytics/cti";
import { CastAnalyticsPage } from "@/components/analytics/cast-analytics-page";
import { AnalyticsPageLayout } from "@/components/analytics/shared";

export default async function CastPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string; castId?: string }> }) {
  const query = await searchParams;
  const range = resolveDateRange(query.from, query.to);
  return <AnalyticsPageLayout layoutOnly><CastAnalyticsPage initialFrom={range.fromText} initialTo={range.toText} initialStore={query.store || "ALL"} initialCastId={query.castId || ""} /></AnalyticsPageLayout>;
}
