import { describe, expect, it } from "vitest";
import { toTrendViewModel } from "@/lib/analytics/ui/trend-view-model";

const summary = { volume: { metrics: { sales: 100, reservations: 2, attendanceMinutes: 60 }, metricAvailability: { sales: "VALUE" } }, efficiency: { salesPerHour: 100, salesPerPerson: 100, rewardPerHour: null, rewardPerPerson: null, reservationsPerHour: 2, reservationsPerPerson: 2, averageUnitPrice: 50, regularNominationRate: null, utilizationRate: null, theoreticalMaxAchievementRate: null, metricAvailability: { rewardPerHour: "MISSING" } }, sample: { targetDays: 5, attendanceCount: 5, uniqueCastCount: 2, totalAttendanceHours: 5, mediaDataDays: 0, confidence: "Medium" } } as never;

describe("Trend ViewModel", () => {
  it("maps all comparison axes without recalculating values", () => {
    const comparisons = ["previousDay", "previousWeek", "previousWeekday", "previousMonth", "previousMonthToDate"].map((baselineKind, index) => ({ baselineKind, current: 100, baseline: 90, difference: 10, differenceRate: 0.1, availability: "VALUE", currentAvailability: "VALUE", baselineAvailability: "VALUE", period: { from: "2026-05-01", to: "2026-05-30" }, direction: index === 0 ? "increase" : "flat", confidence: "Medium" }));
    const result = toTrendViewModel({ period: { from: "2026-06-01", to: "2026-06-30" }, stores: [], overall: summary, summary, comparisons, comparison: comparisons[4], storeSummaries: [], daily: [] }, "previousWeek");
    expect(result.comparisonOptions).toHaveLength(5);
    expect(result.selectedComparison?.baselineKind).toBe("previousWeek");
    expect(result.efficiency.find((item) => item.key === "rewardPerHour")?.availability).toBe("MISSING");
  });

  it("preserves zero, unavailable, and neutral metadata", () => {
    const result = toTrendViewModel({ period: { from: "2026-06-01", to: "2026-06-01" }, stores: [], summary, comparison: { baselineKind: "previousDay", current: 0, baseline: null, difference: null, differenceRate: null, availability: "UNAVAILABLE", currentAvailability: "ZERO", baselineAvailability: "MISSING", period: { from: "2026-05-31", to: "2026-05-31" }, direction: "unavailable" }, daily: [] });
    expect(result.selectedComparison?.availability).toBe("UNAVAILABLE");
    expect(result.volume.find((item) => item.key === "sales")?.positiveIsBetter).toBe(true);
  });
});
