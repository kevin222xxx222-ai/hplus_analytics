import type { AnalyticsSummaryDto } from "@/lib/analytics/integration/dto";
import type { PerformanceResponseDto } from "./performance-view-model";
import type { TimeResponseDto } from "./time-view-model";

export type StoreSummaryDto = NonNullable<PerformanceResponseDto["storeSummaries"]>[number];
export const STORE_METRICS = [
  ["sales", "売上", "currency"], ["castReward", "女子報酬", "currency"], ["attendancePeople", "出勤人数", "count"],
  ["reservations", "予約", "count"], ["services", "接客", "count"], ["regularNominations", "本指名", "count"],
  ["attendanceMinutes", "出勤時間", "hours"], ["salesPerHour", "売上／時間", "currency"], ["rewardPerHour", "女子報酬／時間", "currency"],
  ["townPv", "Town PV", "count"], ["townUu", "Town UU", "count"], ["heavenAccess", "Heavenアクセス", "count"], ["diaryPosts", "写メ日記", "count"],
] as const;
export type StoreMetricKey = typeof STORE_METRICS[number][0];
export function storeMetric(summary: AnalyticsSummaryDto | undefined, key: string) {
  if (!summary) return null;
  return (summary.volume.metrics as unknown as Record<string, number | null | undefined>)[key] ?? (summary.efficiency as unknown as Record<string, number | null | undefined>)[key] ?? null;
}
export function storeMetricAvailability(summary: AnalyticsSummaryDto | undefined, key: string) {
  const value = storeMetric(summary, key);
  return summary?.volume.metricAvailability?.[key as never] ?? summary?.efficiency.metricAvailability?.[key as never] ?? (value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE");
}
export function storeTimeUrl(from: string, to: string, store?: string) {
  const params = new URLSearchParams({ from, to }); if (store && store !== "ALL") params.set("store", store); return `/api/analytics/time?${params}`;
}
export type StoreTimeData = Pick<TimeResponseDto, "weekdays">;
export type StoreResponseDto = PerformanceResponseDto & Pick<TimeResponseDto, "weekdays">;
