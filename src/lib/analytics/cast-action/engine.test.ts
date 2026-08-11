import { describe, expect, it } from "vitest";
import { buildCastActionPlan } from "./engine";
import type { CastEngineCast } from "@/lib/analytics/cast-diagnosis/types";

const fixture = (primaryType: CastEngineCast["diagnosis"]["primaryType"]): CastEngineCast => ({
  fact: { castId: "cast-1", castName: "テスト", storeLabels: ["春日部"], contracts: { value: 12, availability: "VALUE" }, townUu: { value: 200, availability: "VALUE" }, hourlyReward: { value: 1000, availability: "VALUE" } },
  isMainAttendanceCast: true, isComparisonEligible: true, isTopGroupMember: false, comparisonEligibilityReasons: [], insufficientReasons: [], insufficientPrimaryReason: null,
  peerSelection: { method: "MANAGED_TOP_GROUP_MEDIAN", totalTopGroupCount: 3, similarWorkloadCount: 3, workingHoursRange: null, fallbackReason: null }, comparisonSource: { method: "MANAGED_TOP_GROUP_MEDIAN", peerCount: 3, medianSourceLabel: "管轄全体上位群" },
  comparisons: [{ metricKey: "hourlyReward", label: "平均時給", unit: "円", castMetric: { value: 1000, availability: "VALUE" }, peerMedianMetric: { value: 2000, availability: "VALUE" }, absoluteDifference: -1000, relativeRatio: 0.5, relativeDifference: -0.5, status: "BELOW", peerCoverage: { metricKey: "hourlyReward", eligiblePeerCount: 3, validPeerCount: 3, unavailablePeerCount: 0, missingPeerCount: 0, medianAvailability: "VALUE" }, thresholdsUsed: { comparableRatio: 0.8, lowRatio: 0.6 }, diagnosticUsage: "FORMAL" }],
  diagnosis: { primaryType, secondaryTypes: [], otherReviewReason: null, label: "診断", summary: "確認", facts: [], reviewTargets: [], steps: {} as CastEngineCast["diagnosis"]["steps"] },
  confidence: { overall: { level: "HIGH", label: "高", reasons: ["比較可能"] }, steps: {} as CastEngineCast["confidence"]["steps"], attendanceDays: 5, workingHours: 30, contractCount: 12, townUu: 200, peerCount: 3 }, priority: "PRIORITY",
} as unknown as CastEngineCast);

describe("Cast Action plan DTO", () => {
  it("returns a stable, UI-independent plan with stage and evidence fields", () => {
    const plan = buildCastActionPlan({ cast: fixture("LOW_PAGE_TRAFFIC"), period: { from: "2026-07-01", to: "2026-07-31" } });
    expect(plan.version).toBe("cast-action-v1");
    expect(plan.stageStates.result.state).toBe("LOW");
    expect(plan.actionType).toBeDefined();
    expect(plan.humanJudgmentRequired).toBeTypeOf("boolean");
    expect(plan.period.from).toBe("2026-07-01");
  });
});
