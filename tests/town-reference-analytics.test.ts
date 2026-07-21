import { describe, expect, it } from "vitest";
import { aggregateTown } from "@/lib/analytics/town";
import {
  buildTownReferenceScope,
  calculateTownReferenceMetrics,
  evaluateTownReferencePreview,
  rankTownReferenceRows,
  type TownReferenceConfig,
  type TownReferenceInput,
  type TownReferenceRow,
} from "@/lib/analytics/town-reference";

const config: TownReferenceConfig = { minimumTownUu: 20, minimumCtiContracts: 3, minimumAttendanceMinutes: 240, excellentTelRateQuantile: 0.75 };
const base: TownReferenceInput = { pv: 500, uu: 100, telTapUu: 10, salesAmount: 200000, castRewardAmount: 100000, contractCount: 20, regularNominationCount: 8, attendanceMinutes: 600, hasTownData: true, hasCtiData: true };

function row(id: string, overrides: Partial<TownReferenceInput> = {}): TownReferenceRow {
  return { id, name: id, metrics: calculateTownReferenceMetrics({ ...base, ...overrides }) };
}

describe("Town reference analytics", () => {
  it("calculates contract per UU, sales per UU, sales per TEL and regular nomination rate", () => {
    const metrics = calculateTownReferenceMetrics(base);
    expect(metrics.calculatedContractPerUu).toBe(0.2);
    expect(metrics.salesPerUu).toBe(2000);
    expect(metrics.salesPerTel).toBe(20000);
    expect(metrics.regularNominationRate).toBe(0.4);
  });

  it("returns null instead of zero for every zero denominator", () => {
    const metrics = calculateTownReferenceMetrics({ ...base, uu: 0, telTapUu: 0, contractCount: 0 });
    expect(metrics.calculatedContractPerUu).toBeNull();
    expect(metrics.salesPerUu).toBeNull();
    expect(metrics.salesPerTel).toBeNull();
    expect(metrics.regularNominationRate).toBeNull();
  });

  it("uses only matching Town/CTI dates and supports store and overall scopes", () => {
    const from = new Date("2026-07-01T00:00:00Z"); const to = new Date("2026-07-31T00:00:00Z");
    const town = [
      { date: new Date("2026-07-01T00:00:00Z"), storeId: "k", pv: 100, uu: 20, telTapUu: 2 },
      { date: new Date("2026-07-02T00:00:00Z"), storeId: "o", pv: 200, uu: 40, telTapUu: 4 },
      { date: new Date("2026-08-01T00:00:00Z"), storeId: "k", pv: 999, uu: 999, telTapUu: 999 },
    ];
    const cti = [
      { businessDate: new Date("2026-07-01T00:00:00Z"), storeId: "k", salesAmount: 30000, castRewardAmount: 15000, contractCount: 3, regularNominationCount: 1, attendanceMinutes: 300 },
      { businessDate: new Date("2026-07-02T00:00:00Z"), storeId: "o", salesAmount: 50000, castRewardAmount: 25000, contractCount: 5, regularNominationCount: 2, attendanceMinutes: 300 },
      { businessDate: new Date("2026-08-01T00:00:00Z"), storeId: "k", salesAmount: 999999, castRewardAmount: 0, contractCount: 99, regularNominationCount: 99, attendanceMinutes: 0 },
    ];
    expect(buildTownReferenceScope(town, cti, from, to)).toMatchObject({ pv: 300, uu: 60, salesAmount: 80000, contractCount: 8 });
    expect(buildTownReferenceScope(town, cti, from, to, "k")).toMatchObject({ pv: 100, uu: 20, salesAmount: 30000, contractCount: 3 });
  });

  it("calculates independent rankings with competition ties", () => {
    const rows = [row("A", { pv: 100 }), row("B", { pv: 100 }), row("C", { pv: 50 })];
    expect(rankTownReferenceRows(rows, "pv", config).map(({ id, rank }) => [id, rank])).toEqual([["A", 1], ["B", 1], ["C", 3]]);
    expect(rankTownReferenceRows(rows, "salesAmount", config)[0].rank).toBe(1);
  });

  it("excludes insufficient denominators from rate rankings", () => {
    const rows = [row("enough"), row("low-uu", { uu: 10 }), row("low-contract", { contractCount: 2 })];
    expect(rankTownReferenceRows(rows, "salesPerUu", config).map((item) => item.id)).not.toContain("low-uu");
    expect(rankTownReferenceRows(rows, "regularNominationRate", config).map((item) => item.id)).not.toContain("low-contract");
  });

  it("returns configurable evaluation previews and their evidence", () => {
    const excellent = row("好調候補", { uu: 120, telTapUu: 18, contractCount: 20, regularNominationCount: 10 });
    const baseline = row("比較対象", { uu: 60, telTapUu: 3, contractCount: 10, regularNominationCount: 2 });
    const preview = evaluateTownReferencePreview(excellent, [excellent, baseline], config);
    expect(preview.code).toBe("EXCELLENT");
    expect(preview.reasons).toEqual(expect.arrayContaining([expect.stringContaining("UUは比較対象中央値"), expect.stringContaining("TEL率") , expect.stringContaining("本指名率")]));
  });

  it("always marks minimum-sample failures as insufficient data", () => {
    const target = row("不足", { uu: 10, contractCount: 1, attendanceMinutes: 30 });
    const preview = evaluateTownReferencePreview(target, [target], config);
    expect(preview.code).toBe("INSUFFICIENT_DATA");
    expect(preview.suggestions[0]).toContain("データ不足");
  });

  it("produces non-definitive improvement suggestions with metric evidence", () => {
    const target = row("候補", { uu: 30, telTapUu: 1, contractCount: 10, regularNominationCount: 1 });
    const comparison = row("比較", { uu: 100, telTapUu: 10, contractCount: 10, regularNominationCount: 5 });
    const preview = evaluateTownReferencePreview(target, [target, comparison], config);
    expect(preview.code).toBe("WATCH");
    expect(preview.suggestions.join(" ")).toMatch(/TEL率.*中央値.*候補|本指名率.*可能性/);
  });

  it("does not mutate or replace existing Town KPI aggregation", () => {
    const source = [{ pv: 1000, uu: 100, telTapUu: 10 }, { pv: 100, uu: 10, telTapUu: 0 }];
    const before = aggregateTown(source);
    calculateTownReferenceMetrics(base);
    expect(aggregateTown(source)).toEqual(before);
    expect(before).toMatchObject({ pv: 1100, uu: 110, telTapUu: 10, averagePv: 10 });
  });
});
