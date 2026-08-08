import { CastDiagnosisDetailPage } from "@/components/analytics/cast-diagnosis-detail-page";
import { AnalyticsPageLayout } from "@/components/analytics/shared";
import { resolveDateRange } from "@/lib/analytics/cti";

export default async function CastDiagnosisDetailRoute({ params, searchParams }: { params: Promise<{ castId: string }>; searchParams: Promise<{ from?: string; to?: string }> }) {
  const [{ castId }, query] = await Promise.all([params, searchParams]);
  const range = resolveDateRange(query.from, query.to);
  return <AnalyticsPageLayout layoutOnly><CastDiagnosisDetailPage castId={castId} initialFrom={range.fromText} initialTo={range.toText} /></AnalyticsPageLayout>;
}
