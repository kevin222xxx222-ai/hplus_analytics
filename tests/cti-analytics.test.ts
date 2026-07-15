import { describe, expect, it } from "vitest";
import { aggregateCti, ratio, type CtiRecord } from "@/lib/analytics/cti";

function record(storeId: string, overrides: Partial<CtiRecord> = {}): CtiRecord {
  return { businessDate: new Date("2026-07-14T00:00:00Z"), storeId, castId: "cast", attendanceCount: 1, attendanceMinutes: 300, reservationCount: 3, cancellationCount: 1, contractCount: 2, regularNominationCount: 1, photoNominationCount: 1, freeCount: 0, salesAmount: 30000, castRewardAmount: 15000, ctiProfitAmount: 10000, payoutAfterRewardAmount: 15000, ...overrides };
}

describe("CTI analytics", () => {
  it("deduplicates attendance days across stores and sums amounts/time", () => {
    const metrics = aggregateCti([record("kasukabe"), record("koshigaya")]);
    expect(metrics.attendanceDays).toBe(1);
    expect(metrics.storeAttendance).toBe(2);
    expect(metrics.attendanceMinutes).toBe(600);
    expect(metrics.salesAmount).toBe(60000);
  });

  it("returns null when a denominator is zero", () => {
    expect(ratio(10, 0)).toBeNull();
  });
});
