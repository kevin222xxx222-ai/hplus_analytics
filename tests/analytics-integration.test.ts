import { describe, expect, it } from "vitest";
import { adaptSnapshot } from "@/lib/analytics/integration/adapter";
import { toPerformanceDto } from "@/lib/analytics/integration/dto";
import { buildPerformanceSummaries } from "@/lib/analytics/integration/service";
import { aggregateVolume, calculateEfficiency } from "@/lib/analytics/engine";

describe("Analytics integration adapter and DTO", () => {
  it("converts Prisma-shaped rows into Engine DTOs and preserves availability", () => {
    const snapshot = {
      from: new Date("2026-06-01T00:00:00.000Z"), to: new Date("2026-06-30T00:00:00.000Z"),
      stores: [{ id: "store", code: "KASUKABE", name: "春日部", shortName: "春日部" }],
      casts: [{ id: "cast", displayName: "あゆみ", normalizedName: "あゆみ", startedOn: new Date("2026-01-01T00:00:00.000Z"), endedOn: null, primaryStoreId: "store", status: "ACTIVE" }],
      cti: [{ businessDate: new Date("2026-06-01T00:00:00.000Z"), storeId: "store", castId: "cast", attendanceCount: 1, attendanceMinutes: 60, reservationCount: 2, serviceCount: 1, regularNominationCount: 1, freeCount: 0, newCount: 1, repeatCount: 0, salesAmount: 100, castRewardAmount: 50, ctiProfitAmount: 20, contractCount: 1, paidOptionCount: 0, diaryCountCti: 0, importBatchId: "batch" }],
      town: [],
      heaven: [{ businessDate: new Date("2026-06-01T00:00:00.000Z"), storeId: "store", castId: "cast", metricKey: "page_access", rawValue: 12, valueKind: "DAILY_EVENT", rawValueStatus: "VALUE", importBatchId: "batch", resolutionKey: "cast:cast" }, { businessDate: new Date("2026-06-02T00:00:00.000Z"), storeId: "store", castId: "cast", metricKey: "page_access", rawValue: 0, valueKind: "DAILY_EVENT", rawValueStatus: "BLANK", importBatchId: "batch", resolutionKey: "cast:cast" }],
    } as never;
    const adapted = adaptSnapshot(snapshot);
    expect(adapted.from).toBe("2026-06-01");
    expect(adapted.rows).toHaveLength(3);
    expect(adapted.rows[0].naturalKey).toBe("cti:batch:2026-06-01:store:cast");
    expect(adapted.rows.find((row) => row.date instanceof Date && row.media === "HEAVEN" && row.metrics.heavenAccess === null)).toBeTruthy();
    const volume = aggregateVolume(adapted.rows)[0];
    expect(volume.metrics.sales).toBe(100);
    expect(volume.metricAvailability.townPv).toBe("MISSING");
    expect(calculateEfficiency(volume).salesPerHour).toBe(100);
  });

  it("emits JSON-safe API DTOs without exposing Prisma dates", () => {
    const dto = toPerformanceDto({ from: "2026-06-01", to: "2026-06-30", stores: [], rows: [], casts: [] }, [{ castId: "cast", summary: { volume: { status: "OK", groupKey: "all", dimensions: {}, metrics: {} as never, metricAvailability: {} as never, sample: { targetDays: 0, attendanceCount: 0, uniqueCastCount: 0, totalAttendanceHours: 0, mediaDataDays: 0, confidence: "Insufficient", sampleKind: "attendanceDays" } }, efficiency: { status: "OK", salesPerHour: null, salesPerPerson: null, rewardPerHour: null, rewardPerPerson: null, reservationsPerHour: null, reservationsPerPerson: null, averageUnitPrice: null, regularNominationRate: null, utilizationRate: null, theoreticalMaxHourly: null, currentHourly: null, opIncludedHourly: null, theoreticalMaxAchievementRate: null, metricAvailability: {} as never }, sample: { targetDays: 0, attendanceCount: 0, uniqueCastCount: 0, totalAttendanceHours: 0, mediaDataDays: 0, confidence: "Insufficient", sampleKind: "attendanceDays" } } }]);
    expect(dto.period).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(JSON.stringify(dto)).not.toContain("undefined");
  });

  it("connects Growth and Next Best Action through Engine results and marks Rank unavailable", () => {
    const adapted = adaptSnapshot({ from: new Date("2026-06-01T00:00:00.000Z"), to: new Date("2026-06-30T00:00:00.000Z"), stores: [], casts: [{ id: "cast", displayName: "あゆみ", normalizedName: "あゆみ", startedOn: new Date("2026-01-01T00:00:00.000Z"), endedOn: null, primaryStoreId: null, status: "ACTIVE" }], cti: [{ businessDate: new Date("2026-06-01T00:00:00.000Z"), storeId: "store", castId: "cast", attendanceCount: 1, attendanceMinutes: 60, reservationCount: 1, serviceCount: 1, regularNominationCount: 0, freeCount: 0, newCount: 0, repeatCount: 0, salesAmount: 100, castRewardAmount: 50, ctiProfitAmount: 20, contractCount: 1, paidOptionCount: 0, diaryCountCti: 0, importBatchId: "batch" }], town: [], heaven: [] } as never);
    const [result] = buildPerformanceSummaries(adapted);
    expect(result.summary.growth).toMatchObject({ classification: "Data不足", availability: "INSUFFICIENT_SAMPLE" });
    expect(result.summary.nextBestAction).toMatchObject({ actionLevel: "NONE", action: null });
    expect(result.summary.rank).toMatchObject({ availability: "UNAVAILABLE" });
  });
});
