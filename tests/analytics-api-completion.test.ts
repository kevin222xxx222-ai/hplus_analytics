import { describe, expect, it } from "vitest";
import { compareValues } from "@/lib/analytics/engine";
import { toComparisonDto, toPerformanceDto, toTimeDto, type AnalyticsSummaryDto } from "@/lib/analytics/integration/dto";

const emptySummary = (): AnalyticsSummaryDto => ({ volume: { status: "OK", groupKey: "all", dimensions: {}, metrics: {} as never, metricAvailability: {} as never, sample: { targetDays: 1, attendanceCount: 1, uniqueCastCount: 1, totalAttendanceHours: 1, mediaDataDays: 1, confidence: "High", sampleKind: "attendanceDays" } }, efficiency: { status: "OK", salesPerHour: 100, salesPerPerson: 100, rewardPerHour: 50, rewardPerPerson: 50, reservationsPerHour: 1, reservationsPerPerson: 1, averageUnitPrice: 100, regularNominationRate: null, utilizationRate: null, theoreticalMaxHourly: null, currentHourly: 50, opIncludedHourly: null, theoreticalMaxAchievementRate: null, metricAvailability: {} as never }, sample: { targetDays: 1, attendanceCount: 1, uniqueCastCount: 1, totalAttendanceHours: 1, mediaDataDays: 1, confidence: "High", sampleKind: "attendanceDays" } });

describe("Analytics API completion DTOs", () => {
  it("normalizes comparison fields and preserves unavailable availability", () => {
    const comparison = compareValues(100, null, "previousDay");
    const dto = toComparisonDto(comparison, { from: "2026-06-01", to: "2026-06-01" });
    expect(dto.availability).toBe("UNAVAILABLE");
    expect(dto.difference).toBeNull();
    expect(dto.differenceRate).toBeNull();
    expect(dto.period.from).toBe("2026-06-01");
  });

  it("returns overall, store summary, and cast summary in one performance DTO", () => {
    const dto = toPerformanceDto({ from: "2026-06-01", to: "2026-06-30", stores: [{ id: "store", code: "KASUKABE", name: "春日部", shortName: "春日部" }], rows: [], casts: [{ id: "cast", displayName: "あゆみ", normalizedName: "あゆみ", startedOn: null, endedOn: null, primaryStoreId: "store", status: "ACTIVE" }] }, [{ castId: "cast", summary: emptySummary() }], emptySummary(), [{ store: { id: "store", code: "KASUKABE", name: "春日部", shortName: "春日部" }, summary: emptySummary() }]);
    expect(dto.overall).toBeDefined();
    expect(dto.storeSummaries).toHaveLength(1);
    expect(dto.casts[0].summary.sample.confidence).toBe("High");
  });

  it("keeps the common overall/store shape available to time DTO", () => {
    const dto = toTimeDto({ from: "2026-06-01", to: "2026-06-30", stores: [], rows: [], casts: [] }, [], emptySummary(), [], undefined);
    expect(dto.overall).toBeDefined();
    expect(dto.storeSummaries).toEqual([]);
  });

  it("keeps action level and explicit no-action reason in the shared contract", () => {
    const dto = toPerformanceDto({ from: "2026-06-01", to: "2026-06-30", stores: [], rows: [], casts: [] }, [], { ...emptySummary(), nextBestAction: { level: "NONE", actionLevel: "NONE", cause: "安定維持", evidence: ["基準を下回っていません"], action: null, reason: "安定維持のため提案なし", confidence: "High", availability: "VALUE", status: "OK" } });
    expect(dto.overall?.nextBestAction?.level).toBe("NONE");
    expect(dto.overall?.nextBestAction?.reason).toBe("安定維持のため提案なし");
  });
});
