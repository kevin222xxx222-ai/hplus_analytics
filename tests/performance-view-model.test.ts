import { describe, expect, it } from "vitest";
import { toPerformanceViewModel } from "@/lib/analytics/ui/performance-view-model";

const summary = (growth?: string, availability = "VALUE") => ({ volume: { metrics: { sales: 100, castReward: 50, reservations: 1, services: 1, regularNominations: 0, attendancePeople: 1, attendanceMinutes: 60, diaryPosts: 0, townPv: null, townUu: null, heavenAccess: null }, metricAvailability: { sales: "VALUE", townPv: "MISSING" }, sample: { targetDays: 1, attendanceCount: 1, uniqueCastCount: 1, totalAttendanceHours: 1, mediaDataDays: 0, confidence: "High" } }, efficiency: { salesPerHour: 100, salesPerPerson: 100, rewardPerHour: 50, rewardPerPerson: 50, reservationsPerHour: 1, reservationsPerPerson: 1, averageUnitPrice: 100, regularNominationRate: null, utilizationRate: null, theoreticalMaxAchievementRate: null, currentHourly: 50, opIncludedHourly: null, theoreticalMaxHourly: null, metricAvailability: { salesPerHour: "VALUE", utilizationRate: "UNAVAILABLE" } }, sample: { targetDays: 1, attendanceCount: 1, uniqueCastCount: 1, totalAttendanceHours: 1, mediaDataDays: 0, confidence: "High" }, growth: growth ? { classification: growth, availability, reason: null, evidence: [growth], score: 10 } : undefined, nextBestAction: { actionLevel: growth === "Data不足" ? "NONE" : "ACTION", cause: "cause", evidence: ["evidence"], action: growth === "安定維持" ? null : "action", confidence: "High", availability, status: "OK" }, rank: { availability: "UNAVAILABLE", reason: "rank" } }) as never;

describe("Performance view model", () => {
  it("maps API DTO without recomputing metrics and preserves missing availability", () => {
    const result = toPerformanceViewModel({ period: { from: "2026-06-01", to: "2026-06-30" }, stores: [], overall: { ...summary() }, casts: [{ castId: "cast", cast: { id: "cast", displayName: "あゆみ" }, summary: summary("Exposure不足") }] });
    expect(result.casts[0].name).toBe("あゆみ");
    expect(result.casts[0].growthLabel).toBe("Exposure不足");
    expect(result.casts[0].metrics.find((metric) => metric.key === "townPv")?.availability).toBe("MISSING");
    expect(result.casts[0].summary.rank?.availability).toBe("UNAVAILABLE");
  });

  it("supports all growth classifications as API labels", () => {
    const values = ["Data不足", "Capacity上限", "Schedule制約", "Exposure不足", "Activity不足", "Efficiency改善余地", "安定維持"];
    for (const value of values) {
      const result = toPerformanceViewModel({ period: { from: "2026-06-01", to: "2026-06-30" }, stores: [], casts: [{ castId: value, cast: { id: value, displayName: value }, summary: summary(value) }] });
      expect(result.casts[0].growthLabel).toBe(value);
    }
  });
});
