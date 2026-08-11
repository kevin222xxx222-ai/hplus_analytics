import type { Availability } from "@/lib/analytics/engine/types";
import type { CastComparisonAxis, CastMetricPeerComparison } from "@/lib/analytics/cast-comparison/types";
import type { CastComparisonProviderMode } from "@/lib/analytics/cast-comparison/types";

export type CastMetric<T = number> = { value: T | null; availability: Availability; isPartial?: boolean; reason?: string; source?: "HEAVEN" | "HEAVEN_TOWN" };
export type CastDiagnosisType = "STABLE_HIGH_EFFICIENCY" | "LIMITED_BY_AVAILABILITY" | "LOW_PAGE_TRAFFIC" | "LOW_PROFILE_CONVERSION" | "LOW_REPEAT_CONVERSION" | "LOW_NEW_CUSTOMER_ACQUISITION" | "OTHER_REVIEW" | "INSUFFICIENT_DATA";
export type CastReviewTarget = "LISTING_PHOTO" | "LISTING_COPY" | "MEDIA_EXPOSURE" | "DIARY_POSTING" | "PROFILE_PHOTOS" | "PROFILE_COPY" | "PROFILE_TEXT" | "DIARY_CONTENT" | "REPEAT_STATUS" | "STAFF_REVIEW" | "CANCELLATIONS" | "DATA_INTEGRITY" | "NONE";
export type CastReviewPriority = "PRIORITY" | "REVIEW" | "WATCH" | "HEALTHY" | "INSUFFICIENT";
export type InsufficientReason = "ATTENDANCE_0_DAYS" | "ATTENDANCE_1_DAY" | "HOURS_BELOW_MINIMUM" | "HOURLY_REWARD_UNCOMPUTABLE" | "INSUFFICIENT_COMPARISON_GROUP" | "CTI_MAJOR_DATA_MISSING" | "OTHER";
export type OtherReviewReason = "HIGH_EFFICIENCY_LOW_SAMPLE" | "PHOTO_EFFICIENCY_GOOD_REPEAT_SAMPLE_LOW" | "INTERMEDIATE_THRESHOLDS" | "LOW_HOURLY_REWARD_WITHOUT_CLEAR_BOTTLENECK" | "NO_EXPLICIT_DIAGNOSIS_MATCH";

export type CastMonthlyFact = {
  castId: string; castName: string; storeIds: string[]; storeLabels: string[];
  attendanceDays: CastMetric; workingHours: CastMetric; reservations: CastMetric; contracts: CastMetric;
  mainNominations: CastMetric; photoNominations: CastMetric; freeCount: CastMetric; newCount: CastMetric; repeatCount: CastMetric; cancelCount: CastMetric;
  femaleReward: CastMetric; chargeAmount: CastMetric; profit: CastMetric; paidOptionCount: CastMetric;
  townPv: CastMetric; townUu: CastMetric; heavenPageAccess: CastMetric; heavenDiaryPosts: CastMetric;
  heavenMyGirlAdds: CastMetric; heavenFavoriteTalks: CastMetric;
  heavenMyGirlAddsPer100Access: CastMetric; heavenMyGirlAddsPer100TownUu: CastMetric;
  heavenFavoriteTalksPerAttendanceDay: CastMetric; heavenFavoriteTalksPer100Access: CastMetric;
  hourlyReward: CastMetric; contractsPerDay: CastMetric; contractsPerHour: CastMetric; photoNominationsPerDay: CastMetric; photoNominationsPerHour: CastMetric; photoNominationsPer100Uu: CastMetric;
  mainNominationRate: CastMetric; photoNominationShare: CastMetric; repeatShare: CastMetric;
};

export type CastDiagnosisInput = {
  period: { from: string; to: string; label?: string };
  facts: CastMonthlyFact[];
  rollingFacts?: CastMonthlyFact[];
  comparisonMode?: CastComparisonProviderMode;
};

export type MetricPeerCoverage = { metricKey: string; eligiblePeerCount: number; validPeerCount: number; unavailablePeerCount: number; missingPeerCount: number; medianAvailability: Availability };
export type CastPeerSelection = { method: "SIMILAR_WORKLOAD_TOP_GROUP_MEDIAN" | "MANAGED_TOP_GROUP_MEDIAN" | "ROLLING_THREE_MONTH_MANAGED_MEDIAN" | "INSUFFICIENT"; totalTopGroupCount: number; similarWorkloadCount: number; workingHoursRange: { minimum: number; maximum: number } | null; fallbackReason: string | null };
export type ComparisonStatus = "ABOVE" | "COMPARABLE" | "INTERMEDIATE" | "BELOW" | "UNCOMPUTABLE";
export type CastMetricComparison = { metricKey: string; label: string; unit: string; castMetric: CastMetric; peerMedianMetric: CastMetric; absoluteDifference: number | null; relativeRatio: number | null; relativeDifference: number | null; status: ComparisonStatus; peerCoverage: MetricPeerCoverage; thresholdsUsed: { comparableRatio: number; lowRatio: number }; comparisonAxis?: CastComparisonAxis; comparisonAxisLabel?: string; peerSelectionMethod?: CastMetricPeerComparison["selection"]["method"]; validPeerCount?: number; candidateCount?: number; workingHoursRange?: { minimum: number; maximum: number } | null; fallbackReason?: string | null; diagnosticUsage?: CastMetricPeerComparison["diagnosticUsage"]; medianEvidence?: CastMetricPeerComparison["medianEvidence"]; peerEvidence?: CastMetricPeerComparison["peers"] };
export type DiagnosisConfidencePart = { level: "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT"; label: string; reasons: string[] };
export type CastDiagnosisConfidence = { overall: DiagnosisConfidencePart; steps: { result: DiagnosisConfidencePart; pageTraffic: DiagnosisConfidencePart; photoConversion: DiagnosisConfidencePart; repeatConversion: DiagnosisConfidencePart }; attendanceDays: number; workingHours: number; contractCount: number; townUu: number | null; peerCount: number };
export type CastDiagnosisFact = { metricKey: string; label: string; castValue: number | null; peerMedianValue: number | null; absoluteDifference: number | null; relativeRatio: number | null; statement: string; availability: Availability; comparisonAxis?: CastComparisonAxis; comparisonAxisLabel?: string; diagnosticUsage?: CastMetricPeerComparison["diagnosticUsage"]; medianEvidence?: CastMetricPeerComparison["medianEvidence"] };
export type DiagnosisStep = { step: "RESULT" | "PAGE_TRAFFIC" | "PHOTO_CONVERSION" | "REPEAT_CONVERSION"; status: "GOOD" | "COMPARABLE" | "INTERMEDIATE" | "LOW" | "UNAVAILABLE" | "INSUFFICIENT"; metrics: CastMetricComparison[]; facts: CastDiagnosisFact[]; confidence: DiagnosisConfidencePart; thresholdExplanation: string };
export type CastComparisonSource = { method: CastPeerSelection["method"]; peerCount: number; medianSourceLabel: string };
export type CastEngineCast = { fact: CastMonthlyFact; isMainAttendanceCast: boolean; isComparisonEligible: boolean; isTopGroupMember: boolean; comparisonEligibilityReasons: string[]; insufficientReasons: InsufficientReason[]; insufficientPrimaryReason: InsufficientReason | null; peerSelection: CastPeerSelection; comparisonSource: CastComparisonSource; comparisons: CastMetricComparison[]; diagnosis: { primaryType: CastDiagnosisType; secondaryTypes: CastDiagnosisType[]; otherReviewReason: OtherReviewReason | null; label: string; summary: string; facts: CastDiagnosisFact[]; reviewTargets: CastReviewTarget[]; steps: { result: DiagnosisStep; pageTraffic: DiagnosisStep; photoConversion: DiagnosisStep; repeatConversion: DiagnosisStep } }; confidence: CastDiagnosisConfidence; priority: CastReviewPriority };
export type InsufficientBreakdown = { byPrimaryReason: Record<InsufficientReason, number>; reasonOccurrences: Record<InsufficientReason, number> };
export type CastDiagnosisSummary = { totalFactCastCount: number; totalCastCount: number; mainAttendanceCastCount: number; nonMainAttendanceCastCount: number; comparisonEligibleCount: number; topGroupCount: number; mainAttendanceDiagnosisCounts: Record<CastDiagnosisType, number>; allCastDiagnosisCounts: Record<CastDiagnosisType, number>; mainAttendanceConfidenceCounts: Record<string, number>; allCastConfidenceCounts: Record<string, number>; insufficientBreakdown: InsufficientBreakdown; diagnosisCounts: Record<CastDiagnosisType, number>; confidenceCounts: Record<string, number> };
export type CastDiagnosisEngineResult = { period: { from: string; to: string; label: string }; thresholds: ReturnType<typeof import("./thresholds").thresholdsDto>; comparisonGroup: { scope: "MANAGED_ALL"; eligibleCastCount: number; topGroupCastCount: number; method: string; metricCoverage: MetricPeerCoverage[]; topGroupMedians: Record<string, CastMetric> }; summary: CastDiagnosisSummary; casts: CastEngineCast[] };
