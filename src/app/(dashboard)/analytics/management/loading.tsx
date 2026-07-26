import { AnalyticsPageLayout, AnalyticsLoadingState } from "@/components/analytics/shared";

export default function Loading() {
  return <AnalyticsPageLayout layoutOnly><AnalyticsLoadingState /></AnalyticsPageLayout>;
}
