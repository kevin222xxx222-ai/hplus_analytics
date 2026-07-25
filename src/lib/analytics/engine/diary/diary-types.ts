import type { Availability, Confidence } from "../types";

export type DiaryInputRow = {
  date: string;
  storeId: string;
  castId?: string | null;
  townDiaryPv?: number | null;
  townDiaryUu?: number | null;
  townDiaryTel?: number | null;
  townCastPagePv?: number | null;
  townCastPageUu?: number | null;
  townStorePv?: number | null;
  townStoreUu?: number | null;
  ctiDiaryPostCount?: number | null;
  heavenDiaryPostCount?: number | null;
  sales?: number | null;
  compensation?: number | null;
  reservations?: number | null;
  receptions?: number | null;
  contracts?: number | null;
  attendanceCount?: number | null;
  workHours?: number | null;
  naturalKey: string;
};

export type DiaryMetric = { value: number | null; availability: Availability };
export type DiarySummary = {
  sampleDays: number;
  ctiDiaryPostCount: DiaryMetric;
  heavenDiaryPostCount: DiaryMetric;
  diaryPostActivityReference: DiaryMetric;
  townDiaryPv: DiaryMetric;
  townDiaryUu: DiaryMetric;
  townDiaryTel: DiaryMetric;
  townCastPagePv: DiaryMetric;
  townCastPageUu: DiaryMetric;
  townStorePv: DiaryMetric;
  townStoreUu: DiaryMetric;
  sales: DiaryMetric;
  compensation: DiaryMetric;
  reservations: DiaryMetric;
  contracts: DiaryMetric;
  attendanceCount: DiaryMetric;
  workHours: DiaryMetric;
  efficiencies: Record<string, DiaryMetric>;
  availability: Availability;
  confidence: Confidence;
};

export type DiaryCause = "STORE_TRAFFIC_LOW" | "STORE_UU_LOW" | "DIARY_POST_ACTIVITY_LOW" | "DIARY_EXPOSURE_LOW" | "DIARY_UU_LOW" | "CAST_PAGE_EXPOSURE_LOW" | "PROFILE_TRANSITION_LOW" | "UU_LOW" | "ATTENDANCE_LOW" | "WORK_HOURS_LOW" | "RESERVATION_CONVERSION_LOW" | "RECEPTION_CONVERSION_LOW" | "SALES_PER_RESERVATION_LOW" | "UNIT_PRICE_LOW" | "DATA_INSUFFICIENT" | "STABLE";
export type DiaryCauseCandidate = { code: DiaryCause; label: string; description: string; priority: number; score: number; severity: "HIGH" | "MEDIUM" | "LOW"; evidence: string[]; relatedMetricKeys: string[]; availability: Availability; confidence: Confidence; isPrimary: boolean };
export type DiaryRecommendedAction = { code: "REVIEW_STORE_EXPOSURE" | "INCREASE_DIARY_POSTING" | "REVIEW_DIARY_CONTENT" | "REVIEW_PROFILE_CONTENT" | "REQUEST_ADDITIONAL_ATTENDANCE" | "EXTEND_WORK_HOURS" | "REVIEW_RESERVATION_ROUTE" | "REVIEW_PRICING_OR_COURSE_MIX" | "CHECK_DATA_IMPORT"; title: string; description: string; priority: number; score: number; evidence: string[]; relatedCauseCodes: DiaryCause[]; relatedMetricKeys: string[]; availability: Availability; confidence: Confidence };
export type DiaryWeekdaySummary = DiarySummary & { weekday: number; label: string; causeCandidates: DiaryCauseCandidate[]; primaryCause: DiaryCause; recommendedActions: DiaryRecommendedAction[]; primaryAction: DiaryRecommendedAction | null; comparisonContext?: { salesMedian: DiaryMetric; storeUuMedian: DiaryMetric; diaryPvMedian: DiaryMetric; castPagePvMedian: DiaryMetric } };
