import { describe, expect, it } from "vitest";
import { benchmarkStatus, confidenceForSample, percentile, resolveBenchmarkThreshold, summarize } from "./goal-benchmarks";

describe("goal benchmark helpers", () => {
  it("uses a stable interpolated percentile definition", () => {
    expect(percentile([1, 2, 3, 4], 0.25)).toBe(1.75);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([], 0.5)).toBeNull();
  });

  it("summarizes sample, range and quartiles", () => {
    expect(summarize([10, 20, 30])).toMatchObject({ sample: 3, min: 10, max: 30, mean: 20, median: 20, p25: 15, p75: 25 });
  });

  it("uses required pace while a goal remains, otherwise calendar-day pace", () => {
    expect(resolveBenchmarkThreshold({ monthlyTarget: 1000, requiredDailyAverage: 80, remainingAmount: 500, remainingDays: 5, calendarDays: 31 })).toEqual({ value: 80, basis: "REQUIRED_DAILY_AVERAGE" });
    expect(resolveBenchmarkThreshold({ monthlyTarget: 1000, requiredDailyAverage: 0, remainingAmount: 0, remainingDays: 0, calendarDays: 31 })).toEqual({ value: 1000 / 31, basis: "TARGET_DAILY_PACE" });
    expect(resolveBenchmarkThreshold({ monthlyTarget: null, requiredDailyAverage: null, remainingAmount: null, remainingDays: 5, calendarDays: 31 })).toEqual({ value: null, basis: "UNAVAILABLE" });
  });

  it("distinguishes insufficient, unavailable and range statuses", () => {
    expect(benchmarkStatus(5, summarize([1, 2, 3]))).toBe("INSUFFICIENT_SAMPLE");
    expect(benchmarkStatus(null, summarize([1, 2, 3, 4, 5, 6, 7, 8]))).toBe("UNAVAILABLE");
    const reference = summarize([10, 20, 30, 40, 50, 60, 70, 80]);
    expect(benchmarkStatus(5, reference)).toBe("BELOW_REFERENCE");
    expect(benchmarkStatus(45, reference)).toBe("WITHIN_REFERENCE");
    expect(benchmarkStatus(100, reference)).toBe("ABOVE_REFERENCE");
  });

  it("keeps the shared confidence thresholds", () => {
    expect(confidenceForSample(4)).toBe("Insufficient");
    expect(confidenceForSample(5)).toBe("Low");
    expect(confidenceForSample(10)).toBe("Medium");
    expect(confidenceForSample(20)).toBe("High");
  });
});
