import { confidenceForSample } from "./constants";
import type { Confidence, SampleSummary } from "./types";

export type SampleInput = {
  targetDays?: number;
  attendanceCount?: number;
  uniqueCastCount?: number;
  totalAttendanceHours?: number;
  mediaDataDays?: number;
  comparisonCount?: number;
  sampleKind?: SampleSummary["sampleKind"];
};

export function assessConfidence(sample: number): Confidence { return confidenceForSample(sample); }

export function summarizeSample(input: SampleInput): SampleSummary {
  const sampleKind = input.sampleKind ?? "attendanceDays";
  const sample = sampleKind === "attendanceCount" ? input.attendanceCount ?? 0 : sampleKind === "comparisonCount" ? input.comparisonCount ?? 0 : sampleKind === "mediaDays" ? input.mediaDataDays ?? 0 : input.targetDays ?? 0;
  return {
    targetDays: input.targetDays ?? 0,
    attendanceCount: input.attendanceCount ?? 0,
    uniqueCastCount: input.uniqueCastCount ?? 0,
    totalAttendanceHours: input.totalAttendanceHours ?? 0,
    mediaDataDays: input.mediaDataDays ?? 0,
    comparisonCount: input.comparisonCount,
    confidence: assessConfidence(sample),
    sampleKind,
  };
}
