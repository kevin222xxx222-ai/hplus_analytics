import type { AnalyticsFilterState } from "@/lib/analytics/shared";

export type TimeMetricCategory = "efficiency" | "volume" | "sample";
export type TimeResponseDto = {
  period: { from: string; to: string };
  stores: Array<{ id: string; code: string; name: string; shortName: string }>;
  overall?: { volume: { metrics: Record<string, number | null>; metricAvailability?: Record<string, string>; sample: Record<string, unknown>; efficiency: Record<string, unknown> }; efficiency: Record<string, unknown>; sample: Record<string, unknown>; growth?: unknown; nextBestAction?: unknown };
  storeSummaries?: Array<{ store: { id: string; code: string; name: string; shortName: string }; summary: TimeResponseDto["overall"] }>;
  weekdays?: Array<{ weekday: number; label: string; volume: { metrics: Record<string, number | null>; metricAvailability?: Record<string, string>; sample: Record<string, unknown> }; efficiency: Record<string, number | null> & { metricAvailability?: Record<string, string> }; sample: Record<string, unknown> }>;
  crossAnalysis?: Array<{ weekday: number; label: string; sampleDays: number; sales: { value: number | null; availability: string }; compensation: { value: number | null; availability: string }; reservations: { value: number | null; availability: string }; contracts: { value: number | null; availability: string }; townStorePv: { value: number | null; availability: string }; townStoreUu: { value: number | null; availability: string }; townDiaryPv: { value: number | null; availability: string }; townDiaryUu: { value: number | null; availability: string }; townCastPagePv: { value: number | null; availability: string }; townCastPageUu: { value: number | null; availability: string }; ctiDiaryPostCount: { value: number | null; availability: string }; heavenDiaryPostCount: { value: number | null; availability: string }; diaryPostActivityReference: { value: number | null; availability: string }; attendanceCount: { value: number | null; availability: string }; workHours: { value: number | null; availability: string }; efficiencies: Record<string, { value: number | null; availability: string }>; confidence: string; primaryCause: string; causeCandidates: Array<{ code: string; label: string; priority: number; score: number; evidence: string[]; isPrimary: boolean }>; recommendedActions: Array<{ code: string; title: string; priority: number; score: number; evidence: string[] }>; primaryAction: { code: string; title: string; score: number; evidence: string[] } | null; comparisonContext?: Record<string, { value: number | null; availability: string }> }>;
  weekdayDetails?: TimeResponseDto["crossAnalysis"];
};

export const TIME_METRICS: Record<TimeMetricCategory, Array<{ key: string; label: string; format: "number" | "currency" | "hours" | "percent" }>> = {
  efficiency: [
    { key: "salesPerHour", label: "売上／出勤時間", format: "currency" },
    { key: "rewardPerHour", label: "女子報酬／出勤時間", format: "currency" },
    { key: "reservationsPerHour", label: "予約／出勤時間", format: "number" },
    { key: "averageUnitPrice", label: "平均単価", format: "currency" },
    { key: "regularNominationRate", label: "本指名率", format: "percent" },
    { key: "currentHourly", label: "現在時給", format: "currency" },
  ],
  volume: [
    { key: "sales", label: "売上", format: "currency" },
    { key: "castReward", label: "女子報酬", format: "currency" },
    { key: "reservations", label: "予約数", format: "number" },
    { key: "services", label: "接客数", format: "number" },
    { key: "attendancePeople", label: "出勤人数", format: "number" },
    { key: "attendanceMinutes", label: "出勤時間", format: "hours" },
    { key: "townPv", label: "TownキャストページPV", format: "number" },
    { key: "townUu", label: "TownキャストページUU", format: "number" },
    { key: "heavenAccess", label: "Heaven女の子ページアクセス", format: "number" },
  ],
  sample: [
    { key: "targetDays", label: "対象日数", format: "number" },
    { key: "attendanceCount", label: "出勤サンプル", format: "number" },
    { key: "uniqueCastCount", label: "対象キャスト数", format: "number" },
    { key: "totalAttendanceHours", label: "総出勤時間", format: "hours" },
    { key: "mediaDataDays", label: "媒体データ日数", format: "number" },
  ],
};

export function buildTimeUrl(filters: AnalyticsFilterState) {
  const params = new URLSearchParams({ from: filters.from, to: filters.to });
  if (filters.store && filters.store !== "ALL") params.set("store", filters.store);
  return `/api/analytics/time?${params.toString()}`;
}

export function formatTimeValue(value: unknown, format: string) {
  if (value === null || value === undefined || typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (format === "currency") return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  if (format === "hours") return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1 })}h`;
  if (format === "percent") return `${(value * 100).toLocaleString("ja-JP", { maximumFractionDigits: 1 })}%`;
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

export function timeAvailability(value: unknown, availability?: string) {
  if (availability) return availability;
  if (value === null || value === undefined) return "MISSING";
  return value === 0 ? "ZERO" : "VALUE";
}
