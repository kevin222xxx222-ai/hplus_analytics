import { CastTrendPage } from "@/components/analytics/cast-trend-page";
import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { resolveDateRange } from "@/lib/analytics/cti";

export default async function CastTrendRoute({ params, searchParams }: { params: Promise<{ castId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ castId }, query] = await Promise.all([params, searchParams]);
  const range = resolveDateRange(query.from, query.to);
  return <AnalyticsPageLayout layoutOnly><CastTrendPage castId={castId} initialFrom={range.fromText} initialTo={range.toText} /></AnalyticsPageLayout>;
}
