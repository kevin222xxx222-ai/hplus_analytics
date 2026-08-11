import type { CastDiagnosisEngineResult } from "./types";

export type CastDiagnosisAuditReport = {
  metadata: { generatedAt: string; period: { from: string; to: string }; comparisonModes: { baseline: "LEGACY_RESULT_TOP_ONLY"; current: "AXIS_SPECIFIC" }; diagnosisVersion: string; thresholdsVersion: string; gitCommit: string | null };
  dataset: { totalFactCastCount: number; mainAttendanceCastCount: number; nonMainAttendanceCastCount: number; comparisonEligibleCount: number; topGroupCount: number };
  summary: { baselineDiagnosisCounts: Record<string, number>; currentDiagnosisCounts: Record<string, number>; baselineMainDiagnosisCounts: Record<string, number>; currentMainDiagnosisCounts: Record<string, number>; baselineConfidenceCounts: Record<string, number>; currentConfidenceCounts: Record<string, number>; primaryChangedCount: number; primaryUnchangedCount: number; validationViolationCount: number; factsMismatchCount: number; axisMismatchCount: number; stoppedBySafetyCondition: boolean; safetyReasons: string[] };
  changedCasts: unknown[];
  representativeCasts: unknown[];
  validation: { checkedCastCount: number; validCastCount: number; invalidCastCount: number; violations: unknown[] };
  axisAudit: { checkedCount: number; mismatchCount: number; mismatches: unknown[] };
  factsAudit: { checkedCount: number; mismatchCount: number; mismatches: unknown[] };
  availabilityAudit: { byAxis: Record<string, Record<string, number>>; byMetric: Record<string, Record<string, number>> };
  confidenceAudit: { baselineOverall: Record<string, number>; currentOverall: Record<string, number>; baselineSteps: Record<string, Record<string, number>>; currentSteps: Record<string, Record<string, number>> };
  otherReviewAudit: { baselineCount: number; currentCount: number; remainedCount: number; newlyEnteredCount: number; exitedCount: number; reasonCounts: Record<string, number>; newlyEntered: unknown[] };
};

export type DiagnosisAuditRun = { baseline: CastDiagnosisEngineResult; current: CastDiagnosisEngineResult; report: CastDiagnosisAuditReport };
