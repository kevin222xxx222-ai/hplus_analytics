import { DiaryAnalyticsPage } from "@/components/analytics/diary-analytics-page";
import { resolveDateRange } from "@/lib/analytics/cti";

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; store?: string }> }) {
  const query = await searchParams; const range = resolveDateRange(query.from, query.to); const store = query.store ?? "ALL";
  return <DiaryAnalyticsPage initialFrom={range.fromText} initialTo={range.toText} initialStore={store} />;
}
