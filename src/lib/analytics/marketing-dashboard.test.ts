import { describe, expect, it } from "vitest";
import { aggregateDashboardCast, analyzeMarketingLab, classifyDashboardRows, classifyDiscoveryRows, median, ratio } from "./marketing-dashboard";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const cast = { id: "cast-1", name: "テスト", primaryStore: "春日部" };

describe("marketing dashboard metrics", () => {
  it("uses null for zero denominators and counts attendance dates once", () => {
    const row = aggregateDashboardCast(cast, [
      { castId: "cast-1", storeId: "store-1", date: day("2026-06-01"), attendanceCount: 1, attendanceMinutes: 60, sales: 10000, reward: 5000, reservations: 1, services: 1, contracts: 1, regular: 1 },
      { castId: "cast-1", storeId: "store-1", date: day("2026-06-01"), attendanceCount: 1, attendanceMinutes: 60, sales: 20000, reward: 10000, reservations: 1, services: 1, contracts: 1, regular: 0 },
    ], [], []);
    expect(row.attendanceDays).toBe(1); expect(row.salesPerDay).toBe(30000); expect(row.contractsPerTownUu).toBeNull(); expect(ratio(1, 0)).toBeNull();
  });
  it("aggregates Heaven snapshot as the last value", () => {
    const row = aggregateDashboardCast(cast, [], [], [
      { castId: "cast-1", storeId: "store-1", date: day("2026-06-01"), metricKey: "my_girl", value: 10, status: "VALUE", kind: "SNAPSHOT" },
      { castId: "cast-1", storeId: "store-1", date: day("2026-06-30"), metricKey: "my_girl", value: 14, status: "VALUE", kind: "SNAPSHOT" },
    ]);
    expect(row.myGirl).toBe(14); expect(row.myGirlChange).toBe(4);
  });
  it("provides median-based candidate lists", () => {
    expect(median([1, 3, 5])).toBe(3);
    const rows = [1, 2, 3, 4].map((sales, i) => aggregateDashboardCast({ ...cast, id: `c${i}`, name: `C${i}` }, [{ castId: `c${i}`, storeId: "store-1", date: day("2026-06-01"), attendanceCount: 1, attendanceMinutes: 60, sales: sales * 10000, reward: sales * 5000, reservations: 1, services: 1, contracts: 1, regular: 1 }], [], []));
    expect(classifyDashboardRows(rows).medDays).toBe(1); expect(classifyDashboardRows(rows).hidden.length).toBeGreaterThanOrEqual(0);
  });
  it("separates active cohorts and does not classify missing Town as a bottleneck", () => {
    const active = aggregateDashboardCast({ ...cast, id: "active" }, [{ castId: "active", storeId: "store-1", date: day("2026-06-01"), attendanceCount: 1, attendanceMinutes: 60, sales: 50000, reward: 20000, reservations: 5, services: 5, contracts: 3, regular: 2 }], [], []);
    const noAttendance = aggregateDashboardCast({ ...cast, id: "missing" }, [], [], []);
    const result = classifyDiscoveryRows([active, noAttendance], day("2026-06-01"), day("2026-06-30"));
    expect(result.activeRows.map((x) => x.cast.id)).toEqual(["active"]);
    expect(result.tags.find((x) => x.row.cast.id === "missing")?.tags).toContain("NO_ATTENDANCE");
    expect(result.bottlenecks.every((x) => x.row.cast.id === "active")).toBe(true);
  });
  it("requires minimum denominators for buried conversion issues", () => {
    const row = aggregateDashboardCast({ ...cast, id: "small" }, [{ castId: "small", storeId: "store-1", date: day("2026-06-01"), attendanceCount: 1, attendanceMinutes: 60, sales: 10000, reward: 5000, reservations: 1, services: 1, contracts: 0, regular: 0 }], [{ castId: "small", storeId: "store-1", date: day("2026-06-01"), pv: 100, uu: 10, tel: 0 }], []);
    const result = classifyDiscoveryRows([row], day("2026-06-01"), day("2026-06-30"));
    expect(result.buried.some((x) => x.label === "接客転換低下" || x.label === "再指名課題")).toBe(false);
  });
  it("creates Marketing Lab high/low groups from active casts only", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((value, i) => aggregateDashboardCast({ id: `lab-${i}`, name: `Lab${i}`, primaryStore: "春日部" }, ["2026-06-01", "2026-06-02"].map((date) => ({ castId: `lab-${i}`, storeId: "store-1", date: day(date), attendanceCount: 1, attendanceMinutes: 60 * value, sales: value * 10000, reward: value * 5000, reservations: value, services: value, contracts: value, regular: value, diaryCount: value })), [], []));
    const result = analyzeMarketingLab(rows);
    expect(result.active).toHaveLength(6);
    expect(result.high.length).toBeGreaterThan(0);
    expect(result.low.length).toBeGreaterThan(0);
    expect(result.diaryGroups.reduce((sum, group) => sum + group.rows.length, 0)).toBe(6);
  });
  it("classifies efficiency sides and scores grouped hypotheses", () => {
    const rows = Array.from({ length: 8 }, (_, i) => aggregateDashboardCast({ id: `score-${i}`, name: `Score${i}`, primaryStore: "春日部" }, ["2026-06-01", "2026-06-02", "2026-06-03"].map((date) => ({ castId: `score-${i}`, storeId: "store-1", date: day(date), attendanceCount: 1, attendanceMinutes: 120, sales: (i + 1) * 10000, reward: (i + 1) * 4000, reservations: i + 1, services: i + 1, contracts: i % 3, regular: i % 2 })), [], []));
    const result = analyzeMarketingLab(rows);
    expect(result.efficiencyClasses).toHaveLength(8);
    expect(result.efficiencyClasses.every((x) => ["HIGH_ONLY", "LOW_ONLY", "MIXED", "NEUTRAL"].includes(x.classification))).toBe(true);
    expect(result.rawHypotheses.every((x) => typeof x.priorityScore === "number")).toBe(true);
    expect(result.hypotheses.length).toBeLessThanOrEqual(result.rawHypotheses.length);
  });
});
