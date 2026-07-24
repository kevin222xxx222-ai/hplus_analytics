import { describe, expect, it } from "vitest";
import {
  aggregateVolume, assessConfidence, calculateEfficiency, compareValues, trendFromComparison,
  classifyGrowth, nextBestAction, analyzeWeekdays, weekdaySuitability,
  averageBaseline, comparisonRange,
} from "@/lib/analytics/engine";

const row = (date: string, castId: string, metrics: Record<string, number | null>, extra: Record<string, unknown> = {}) => ({ date, castId, storeId: "store", metrics, naturalKey: `${date}:${castId}`, ...extra }) as never;

describe("Analytics Engine", () => {
  it("aggregates volume by store and preserves missing metrics as null", () => {
    const result = aggregateVolume([
      row("2026-06-01", "a", { sales: 100, attendancePeople: 1, attendanceMinutes: 60 }, { storeId: "k" }),
      row("2026-06-02", "b", { sales: 200, attendancePeople: 1, attendanceMinutes: 120 }, { storeId: "k" }),
      row("2026-06-02", "b", { sales: 999, attendancePeople: 1 }, { storeId: "k" }),
    ], ["store"]);
    expect(result[0].metrics.sales).toBe(300);
    expect(result[0].metrics.townPv).toBeNull();
    expect(result[0].sample.uniqueCastCount).toBe(2);
    expect(result[0].sample.totalAttendanceHours).toBe(3);
  });

  it("returns null instead of dividing by zero", () => {
    const volume = aggregateVolume([row("2026-06-01", "a", { sales: 100, attendancePeople: 0, attendanceMinutes: 0 })])[0];
    const efficiency = calculateEfficiency(volume);
    expect(efficiency.salesPerHour).toBeNull();
    expect(efficiency.salesPerPerson).toBeNull();
    expect(efficiency.averageUnitPrice).toBeNull();
  });

  it.each([[4, "Insufficient"], [5, "Low"], [6, "Low"], [9, "Low"], [10, "Medium"], [11, "Medium"], [19, "Medium"], [20, "High"], [21, "High"]] as const)("confidence boundary %i", (sample, expected) => {
    expect(assessConfidence(sample)).toBe(expected);
  });

  it("distinguishes observed zero, missing and non-computable values", () => {
    const zero = aggregateVolume([row("2026-06-01", "a", { sales: 0, attendancePeople: 0, attendanceMinutes: 0 })])[0];
    expect(zero.metricAvailability.sales).toBe("ZERO");
    expect(zero.metricAvailability.townPv).toBe("MISSING");
    expect(calculateEfficiency(zero).metricAvailability.salesPerHour).toBe("UNCOMPUTABLE");
    expect(calculateEfficiency(zero).metricAvailability.averageUnitPrice).toBe("MISSING");
  });

  it("returns unavailable comparison without fallback", () => {
    const comparison = compareValues(100, null, "previousMonthToDate");
    expect(comparison.status).toBe("Unavailable");
    expect(comparison.delta).toBeNull();
    expect(trendFromComparison(comparison).direction).toBe("unavailable");
    expect(compareValues(0, 0, "previousDay").availability).toBe("ZERO");
    expect(compareValues(10, 0, "previousDay").changeRate).toBeNull();
    expect(compareValues(null, 10, "previousDay").currentAvailability).toBe("MISSING");
    expect(compareValues(10, null, "previousDay").baselineAvailability).toBe("MISSING");
  });

  it("creates explicit baseline windows and does not fill missing values", () => {
    expect(comparisonRange({ from: "2026-06-10", to: "2026-06-12" }, "previousWeek")).toEqual({ from: "2026-06-03", to: "2026-06-05" });
    expect(averageBaseline("storeAverage", [10, null, 20]).value).toBe(15);
    expect(averageBaseline("storeAverage", [null]).status).toBe("Unavailable");
    expect(comparisonRange({ from: "2024-02-29", to: "2024-02-29" }, "previousMonthToDate")).toEqual({ from: "2024-01-01", to: "2024-01-29" });
    expect(comparisonRange({ from: "2024-03-01", to: "2024-03-31" }, "previousMonth")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(comparisonRange({ from: "2026-06-01", to: "2026-06-30" }, "previousMonthToDate")).toEqual({ from: "2026-05-01", to: "2026-05-30" });
  });

  it("aggregates weekday volume, efficiency and sample", () => {
    const result = analyzeWeekdays([
      row("2026-06-01", "a", { sales: 100, services: 1, attendancePeople: 1, attendanceMinutes: 60 }),
      row("2026-06-08", "a", { sales: 200, services: 2, attendancePeople: 1, attendanceMinutes: 60 }),
    ]);
    const monday = result[1];
    expect(monday.volume.metrics.sales).toBe(300);
    expect(monday.efficiency.salesPerHour).toBe(150);
    expect(monday.sample.targetDays).toBe(2);
  });

  it("classifies growth and emits cause before one action", () => {
    const growth = classifyGrowth({ confidence: "High", exposure: 10, exposureBaseline: 20, activity: 20, activityBaseline: 20, efficiency: 20, efficiencyBaseline: 20, utilizationRate: 0.4, theoreticalMaxAchievementRate: 0.5, attendanceHours: 10 });
    expect(growth.classification).toBe("Exposure不足");
    const action = nextBestAction(growth, { targetDays: 20, attendanceCount: 10, uniqueCastCount: 2, totalAttendanceHours: 10, mediaDataDays: 20, confidence: "High", sampleKind: "attendanceDays" });
    expect(action.cause).toContain("露出");
    expect(action.action).toBeTruthy();
    expect(action.recommendationLevel).toBe("ACTION");
  });

  it("uses deterministic Growth precedence for competing conditions", () => {
    const base = { confidence: "High" as const, exposure: 1, exposureBaseline: 2, activity: 1, activityBaseline: 2, efficiency: 1, efficiencyBaseline: 2, utilizationRate: 0.95, theoreticalMaxAchievementRate: 0.95, attendanceHours: 10 };
    expect(classifyGrowth({ ...base, confidence: "Insufficient" }).classification).toBe("Data不足");
    expect(classifyGrowth({ ...base, maxAttendanceHours: 10 }).classification).toBe("Capacity上限");
    expect(classifyGrowth(base).classification).toBe("Schedule制約");
    expect(classifyGrowth({ ...base, utilizationRate: 0.2, theoreticalMaxAchievementRate: 0.2 }).classification).toBe("Efficiency改善余地");
    expect(classifyGrowth({ confidence: "High", exposure: null, exposureBaseline: null, activity: null, activityBaseline: null, efficiency: null, efficiencyBaseline: null, utilizationRate: null, theoreticalMaxAchievementRate: null, attendanceHours: null }).classification).toBe("Data不足");
  });

  it("does not make strong actions for Low/Insufficient and returns no action for stable", () => {
    const input = { exposure: 10, exposureBaseline: 20, activity: 20, activityBaseline: 20, efficiency: 20, efficiencyBaseline: 20, utilizationRate: 0.4, theoreticalMaxAchievementRate: 0.5, attendanceHours: 10 };
    const low = nextBestAction(classifyGrowth({ ...input, confidence: "Low" }), { targetDays: 5, attendanceCount: 5, uniqueCastCount: 1, totalAttendanceHours: 5, mediaDataDays: 5, confidence: "Low", sampleKind: "attendanceDays" });
    expect(low.recommendationLevel).toBe("REFERENCE");
    const insufficient = nextBestAction(classifyGrowth({ ...input, confidence: "Insufficient" }), { targetDays: 4, attendanceCount: 1, uniqueCastCount: 1, totalAttendanceHours: 1, mediaDataDays: 0, confidence: "Insufficient", sampleKind: "attendanceDays" });
    expect(insufficient.action).toBeNull();
    const stable = nextBestAction(classifyGrowth({ ...input, exposure: 20, confidence: "High" }), { targetDays: 20, attendanceCount: 20, uniqueCastCount: 1, totalAttendanceHours: 20, mediaDataDays: 20, confidence: "High", sampleKind: "attendanceDays" });
    expect(stable.action).toBeNull();
  });

  it("keeps attendance count and unique cast count distinct across same-day stores", () => {
    const result = aggregateVolume([
      row("2026-06-01", "a", { attendancePeople: 1, attendanceMinutes: 60 }, { storeId: "k", naturalKey: "k:date:cast" }),
      row("2026-06-01", "a", { attendancePeople: 1, attendanceMinutes: 60 }, { storeId: "e", naturalKey: "e:date:cast" }),
    ])[0];
    expect(result.sample.attendanceCount).toBe(2);
    expect(result.sample.uniqueCastCount).toBe(1);
    expect(result.sample.targetDays).toBe(1);
  });

  it("returns Data不足 for weekday suitability with insufficient sample", () => {
    const result = weekdaySuitability({ weekday: 5, confidence: "Insufficient", value: 10, personalAverage: 5, storeAverage: 5, rankAverage: 5, reservationEfficiency: null, reservationBaseline: null });
    expect(result.status).toBe("Data不足");
    expect(result.personalDelta).toBeNull();
  });
});
