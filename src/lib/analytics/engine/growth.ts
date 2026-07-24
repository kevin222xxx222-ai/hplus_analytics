import type { GrowthInput, GrowthResult } from "./types";

/** Deterministic precedence when multiple rules match. Do not reorder casually. */
export const GROWTH_PRIORITY = ["Data不足", "Capacity上限", "Schedule制約", "Exposure不足", "Activity不足", "Efficiency改善余地", "安定維持"] as const;

export function classifyGrowth(input: GrowthInput): GrowthResult {
  if (input.confidence === "Insufficient") return { classification: "Data不足", status: "DataInsufficient", score: 0, evidence: ["必要な母数が不足しています"], missingMetrics: ["sample"] };
  const evidence: string[] = [];
  const missingMetrics = [input.exposure === null || input.exposureBaseline === null ? "exposure" : null, input.activity === null || input.activityBaseline === null ? "activity" : null, input.efficiency === null || input.efficiencyBaseline === null ? "efficiency" : null].filter((value): value is string => value !== null);
  const exposureLow = input.exposure !== null && input.exposureBaseline !== null && input.exposure < input.exposureBaseline;
  const activityLow = input.activity !== null && input.activityBaseline !== null && input.activity < input.activityBaseline;
  const efficiencyLow = input.efficiency !== null && input.efficiencyBaseline !== null && input.efficiency < input.efficiencyBaseline;
  const capacity = input.maxAttendanceHours !== undefined && input.maxAttendanceHours !== null && input.attendanceHours !== null && input.attendanceHours >= input.maxAttendanceHours;
  if (capacity) { evidence.push("出勤可能時間の上限に近い"); return { classification: "Capacity上限", status: "OK", score: 90, evidence }; }
  if (input.utilizationRate !== null && input.utilizationRate >= 0.9 && input.theoreticalMaxAchievementRate !== null && input.theoreticalMaxAchievementRate >= 0.9) { evidence.push("稼働率・理論最大時給達成率が高い"); return { classification: "Schedule制約", status: "OK", score: 85, evidence }; }
  if (exposureLow && !activityLow && !efficiencyLow) { evidence.push("露出が基準を下回る"); return { classification: "Exposure不足", status: "OK", score: 70, evidence }; }
  if (activityLow && !efficiencyLow) { evidence.push("活動量が基準を下回る"); return { classification: "Activity不足", status: "OK", score: 65, evidence }; }
  if (efficiencyLow) { evidence.push("効率が基準を下回る"); return { classification: "Efficiency改善余地", status: "OK", score: 60, evidence }; }
  if (missingMetrics.length === 3) return { classification: "Data不足", status: "DataInsufficient", score: 0, evidence: ["比較可能な指標がありません"], missingMetrics };
  return { classification: "安定維持", status: "OK", score: 20, evidence: ["比較可能な指標では基準を下回っていません"], missingMetrics: missingMetrics.length ? missingMetrics : undefined };
}
