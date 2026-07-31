import { describe, expect, it } from "vitest";
import { contractBreakdownState, featurePercentileBoundary, partitionFeatureDays, ratio, startOfWeek, topBottom } from "./store-analytics";
import { buildStoreSalesBreakdown, buildWeeklyAnalysis, comparisonState, salesAverageComparison, withDerivedMetrics } from "./store-analytics-all";
import { formatPointDifference, formatSignedCount, formatSignedCurrency, formatSignedPercent, formatWeeklyAverageCount, formatWeeklyRelativeDifference } from "@/lib/analytics/ui/formatters";

describe("store analytics primitives", () => {
  it("recalculates ratios from aggregate values and preserves zero denominator", () => {
    expect(ratio(150, 10)).toEqual({ value: 15, availability: "VALUE" });
    expect(ratio(0, 10)).toEqual({ value: 0, availability: "ZERO" });
    expect(ratio(150, 0)).toEqual({ value: null, availability: "UNCOMPUTABLE" });
    expect(ratio(null, 10).availability).toBe("MISSING");
  });

  it("keeps contract composition distinct from missing values", () => {
    expect(contractBreakdownState(21, [7, 9, 5])).toEqual({ availability: "VALUE", breakdownTotal: 21, difference: 0, isConsistent: true });
    expect(contractBreakdownState(0, [0, 0, 0])).toEqual({ availability: "VALUE", breakdownTotal: 0, difference: 0, isConsistent: true });
    expect(contractBreakdownState(7, [7, null, 0])).toEqual({ availability: "PARTIAL", breakdownTotal: null, difference: null, isConsistent: null });
    expect(contractBreakdownState(7, [null, null, null])).toEqual({ availability: "MISSING", breakdownTotal: null, difference: null, isConsistent: null });
  });

  it("uses Monday-Sunday weeks, including Sunday rollover", () => {
    expect(startOfWeek("2026-07-06")).toBe("2026-07-06");
    expect(startOfWeek("2026-07-12")).toBe("2026-07-06");
    expect(startOfWeek("2026-07-05")).toBe("2026-06-29");
  });

  it("does not mark every tied day as a feature and excludes missing values", () => {
    const facts = Array.from({ length: 10 }, (_, index) => ({ selected: { sales: { value: index + 1 } }, town: { pv: { value: index === 9 ? null : 50 } } })) as unknown as Parameters<typeof topBottom>[0];
    const revenue = topBottom(facts, (fact) => fact.selected.sales.value);
    expect(revenue.highDays.length).toBeGreaterThan(0);
    const pv = topBottom(facts, (fact) => fact.town.pv.value);
    expect(pv.highDays.length).toBe(0);
    expect(pv.lowDays.length).toBe(0);
  });

  it("uses inclusive upper/lower 30% boundaries for feature analysis", () => {
    expect(featurePercentileBoundary([1, 2, 3, 4, 5], false)).toBe(3);
    expect(featurePercentileBoundary([1, 2, 3, 4, 5], true)).toBe(4);
    expect(featurePercentileBoundary([0, 0, 1, 2, 3], false)).toBe(1);
    expect(featurePercentileBoundary([], true)).toBeNull();
  });

  it("partitions eligible days into disjoint feature and normal days", () => {
    const eligible = Array.from({ length: 29 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}` }));
    const feature = eligible.slice(0, 8);
    const result = partitionFeatureDays(eligible, feature);
    expect(result.featureDays).toHaveLength(8);
    expect(result.normalDays).toHaveLength(21);
    expect(result.featureDays.some((item) => result.normalDays.some((normal) => normal.date === item.date))).toBe(false);
    expect(result.featureDays.length + result.normalDays.length).toBe(eligible.length);
  });

  it("uses the management aggregate definitions and preserves display units", () => {
    expect(13792700 / 567).toBeCloseTo(24326.014, 0);
    expect(567 / 600).toBeCloseTo(0.945, 3);
    expect(197 / 567).toBeCloseTo(0.347, 3);
    expect(formatSignedCurrency(-668500)).toBe("-¥668,500");
    expect(formatSignedCount(29)).toBe("+29");
    expect(formatPointDifference(0.026)).toBe("+2.6pt");
    expect(formatSignedPercent(-0.035)).toBe("-3.5%");
    expect(formatSignedPercent(0.147)).toBe("+14.7%");
    expect(formatSignedPercent(-0.317)).toBe("-31.7%");
    expect(formatSignedPercent(0.035)).toBe("+3.5%");
    expect(formatWeeklyAverageCount(26 / 3)).toBe("8.7");
    expect(formatWeeklyAverageCount(9)).toBe("9.0");
    expect(formatWeeklyRelativeDifference(0.0004)).toBe("±0.1%未満");
    expect(formatPointDifference(0.034)).toBe("+3.4pt");
  });

  it("recalculates aggregate averages and rates from aggregate numerators", () => {
    const aggregate = withDerivedMetrics({
      sales: { value: 13792700, availability: "VALUE" },
      contracts: { value: 567, availability: "VALUE" },
      reservations: { value: 600, availability: "VALUE" },
      nominations: { value: 197, availability: "VALUE" },
      averageRevenuePerContract: { value: 24493, availability: "VALUE" },
      shareOfTotal: { value: 1, availability: "VALUE" },
    });
    expect(aggregate.averageRevenuePerContract.value).toBeCloseTo(24326.014, 0);
    expect(aggregate.reservationContractRate.value).toBeCloseTo(0.945, 3);
    expect(aggregate.nominationRate.value).toBeCloseTo(0.347, 3);
    expect(aggregate.shareOfTotal.value).toBe(1);
    expect(aggregate.averageRevenuePerContract.value).not.toBeCloseTo(24493 + 23544 + 22444, 0);
  });

  it("preserves the 2026-07-01 daily fixture values and store total", () => {
    const breakdown = buildStoreSalesBreakdown(
      { value: 440000, availability: "VALUE" },
      { value: 79000, availability: "VALUE" },
      { value: 0, availability: "ZERO" },
      { value: 519000, availability: "VALUE" },
    );
    expect(breakdown.total.value).toBe(breakdown.kasukabe.value! + breakdown.koshigaya.value! + breakdown.noda.value!);
    expect(13792700 / 567).toBeCloseTo(24326.014, 0);
    expect(21 / 24).toBeCloseTo(0.875, 3);
    expect(7 / 21).toBeCloseTo(0.333, 3);
  });

  it("classifies daily sales against the valid-day average without treating zero as missing", () => {
    const average = { value: 500000, availability: "VALUE" } as const;
    expect(salesAverageComparison({ value: 600000, availability: "VALUE" }, average, 5).status).toBe("ABOVE");
    expect(salesAverageComparison({ value: 500000, availability: "VALUE" }, average, 5).status).toBe("NEAR");
    expect(salesAverageComparison({ value: 450000, availability: "VALUE" }, average, 5).status).toBe("BELOW");
    expect(salesAverageComparison({ value: 0, availability: "ZERO" }, average, 5).status).toBe("BELOW");
    expect(salesAverageComparison({ value: null, availability: "MISSING" }, average, 5).status).toBe("UNAVAILABLE");
    expect(salesAverageComparison({ value: 100, availability: "VALUE" }, { value: 0, availability: "ZERO" }, 5).status).toBe("UNAVAILABLE");
  });

  it("returns deterministic semantic comparison states", () => {
    expect(comparisonState(null, null).state).toBe("UNAVAILABLE");
    expect(comparisonState(0, 0).state).toBe("NEUTRAL");
    expect(comparisonState(100, 0.1).state).toBe("POSITIVE");
    expect(comparisonState(-100, -0.1).state).toBe("NEGATIVE");
  });

  it("keeps every management metric present when comparison inputs are missing", () => {
    const metrics = withDerivedMetrics({ sales: { value: 100, availability: "VALUE" } });
    for (const key of ["sales", "contracts", "contractCount", "reservations", "reservationCount", "reservationContractRate", "nominations", "mainNominationCount", "nominationRate", "mainNominationRate", "averageRevenuePerContract", "shareOfTotal", "salesShare"]) {
      expect(metrics[key]).toBeDefined();
      expect(metrics[key]).toHaveProperty("value");
    }
  });

  it("aggregates complete weeks and recalculates rates from weekly totals", () => {
    const metric = (value: number) => ({ value, availability: value === 0 ? "ZERO" : "VALUE" });
    const facts = Array.from({ length: 14 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, 6 + index)).toISOString().slice(0, 10);
      return { date, selected: { sales: metric(500000 + index * 1000), contracts: metric(10), reservations: metric(20), nominations: metric(4) }, town: { pv: metric(100), uu: metric(50) }, heaven: { pageAccess: metric(200) }, storeDaily: { KASUKABE: { sales: metric(450000) }, KOSHIGAYA: { sales: metric(40000) }, NODA: { sales: metric(10000) } } };
    });
    const result = buildWeeklyAnalysis(facts, "2026-07-06", "2026-07-19");
    expect(result.weeks).toHaveLength(2);
    expect(result.weeks.every((week) => week.isComplete)).toBe(true);
    expect(result.completeWeekSummary.completeWeekCount).toBe(2);
    expect(result.weeks[0].metrics.reservationContractRate.value).toBe(0.5);
    expect(result.weeks[0].metrics.nominationRate.value).toBe(0.4);
    expect(result.weeks[0].metrics.sales.value).toBe(3_521_000);
    expect(result.weeks[0].storeMetrics.KASUKABE.sales.value).toBe(3_150_000);
  });

  it("marks boundary weeks partial and exposes daily averages without a weekly comparison", () => {
    const metric = (value: number) => ({ value, availability: value === 0 ? "ZERO" : "VALUE" });
    const facts = [1, 2, 3].map((day) => ({ date: `2026-07-${String(26 + day).padStart(2, "0")}`, selected: { sales: metric(100000), contracts: metric(2), reservations: metric(3), nominations: metric(1) }, town: { pv: metric(10), uu: metric(5) }, heaven: { pageAccess: metric(20) }, storeDaily: { KASUKABE: { sales: metric(100000) }, KOSHIGAYA: { sales: metric(0) }, NODA: { sales: metric(0) } } }));
    const result = buildWeeklyAnalysis(facts, "2026-07-27", "2026-07-29");
    expect(result.weeks[0].isPartialWeek).toBe(true);
    expect(result.weeks[0].partialReason).toBe("PERIOD_BOUNDARY");
    expect(result.weeks[0].dailyAverages.sales.value).toBe(100000);
    expect(result.weeks[0].calendarDayCount).toBe(3);
    expect(result.weeks[0].salesValidDayCount).toBe(3);
    expect(result.weeks[0].ctiValidDayCount).toBe(3);
    expect(result.weeks[0].townValidDayCount).toBe(3);
    expect(result.weeks[0].heavenValidDayCount).toBe(3);
    expect(result.weeks[0].comparison.sales.status).toBe("UNAVAILABLE");
  });

  it("uses per-metric acquired days when an incomplete week has missing dates", () => {
    const metric = (value: number | null, availability = value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE") => ({ value, availability });
    const facts = [
      { date: "2026-07-27", selected: { sales: metric(676000), contracts: metric(26), reservations: metric(27), nominations: metric(13) }, town: { pv: metric(16591), uu: metric(2494) }, heaven: { pageAccess: metric(2472) }, storeDaily: { KASUKABE: { sales: metric(676000) }, KOSHIGAYA: { sales: metric(0) }, NODA: { sales: metric(0) } } },
      { date: "2026-07-28", selected: { sales: metric(null), contracts: metric(null), reservations: metric(null), nominations: metric(null) }, town: { pv: metric(null), uu: metric(null) }, heaven: { pageAccess: metric(null) }, storeDaily: { KASUKABE: { sales: metric(null) }, KOSHIGAYA: { sales: metric(null) }, NODA: { sales: metric(null) } } },
      { date: "2026-07-29", selected: { sales: metric(null), contracts: metric(null), reservations: metric(null), nominations: metric(null) }, town: { pv: metric(null), uu: metric(null) }, heaven: { pageAccess: metric(null) }, storeDaily: { KASUKABE: { sales: metric(null) }, KOSHIGAYA: { sales: metric(null) }, NODA: { sales: metric(null) } } },
    ];
    const result = buildWeeklyAnalysis(facts, "2026-07-27", "2026-08-02");
    const week = result.weeks[0];
    expect(week.calendarDayCount).toBe(3);
    expect(week.salesValidDayCount).toBe(1);
    expect(week.ctiValidDayCount).toBe(1);
    expect(week.townPvValidDayCount).toBe(1);
    expect(week.townUuValidDayCount).toBe(1);
    expect(week.heavenValidDayCount).toBe(1);
    expect(week.dailyAverages.sales.value).toBe(676000);
    expect(week.dailyAverages.contractCount.value).toBe(26);
    expect(week.dailyAverages.reservationCount.value).toBe(27);
    expect(week.dailyAverages.townPv.value).toBe(16591);
    expect(week.dailyAverages.townUu.value).toBe(2494);
    expect(week.dailyAverages.heavenPageAccess.value).toBe(2472);
  });

  it("counts formal zero as acquired while excluding missing values", () => {
    const metric = (value: number | null, availability = value === null ? "MISSING" : value === 0 ? "ZERO" : "VALUE") => ({ value, availability });
    const facts = [1, 2, 3].map((day) => ({ date: `2026-07-${26 + day}`, selected: { sales: metric(day === 1 ? 0 : null), contracts: metric(day === 1 ? 0 : null), reservations: metric(day === 1 ? 0 : null), nominations: metric(day === 1 ? 0 : null) }, town: { pv: metric(day === 1 ? 0 : null), uu: metric(day === 1 ? 0 : null) }, heaven: { pageAccess: metric(day === 1 ? 0 : null) }, storeDaily: { KASUKABE: { sales: metric(0) }, KOSHIGAYA: { sales: metric(0) }, NODA: { sales: metric(0) } } }));
    const week = buildWeeklyAnalysis(facts, "2026-07-27", "2026-07-29").weeks[0];
    expect(week.salesValidDayCount).toBe(1);
    expect(week.ctiValidDayCount).toBe(1);
    expect(week.townPvValidDayCount).toBe(1);
    expect(week.heavenValidDayCount).toBe(1);
    expect(week.metrics.sales.availability).toBe("ZERO");
  });

  it("keeps the July 27 partial-week fixture values", () => {
    const metric = (value: number) => ({ value, availability: value === 0 ? "ZERO" : "VALUE" });
    const sales = [220000, 230000, 226000];
    const facts = sales.map((salesValue, index) => ({ date: `2026-07-${27 + index}`, selected: { sales: metric(salesValue), contracts: metric([8, 9, 9][index]), reservations: metric(9), nominations: metric([4, 4, 5][index]) }, town: { pv: metric([5500, 5500, 5591][index]), uu: metric([800, 800, 894][index]) }, heaven: { pageAccess: metric([800, 800, 872][index]) }, storeDaily: { KASUKABE: { sales: metric(salesValue - 42000) }, KOSHIGAYA: { sales: metric(42000) }, NODA: { sales: metric(0) } } }));
    const result = buildWeeklyAnalysis(facts, "2026-07-27", "2026-08-02");
    const week = result.weeks[0];
    expect(week.validDayCount).toBe(3);
    expect(week.metrics.sales.value).toBe(676000);
    expect(Object.values(week.storeMetrics).reduce((sum, item) => sum + (item.sales.value ?? 0), 0)).toBe(676000);
    expect(week.dailyAverages.sales.value).toBeCloseTo(225333.333, 2);
    expect(week.metrics.contracts.value).toBe(26);
    expect(week.dailyAverages.contractCount.value).toBeCloseTo(8.666, 2);
    expect(week.metrics.reservations.value).toBe(27);
    expect(week.dailyAverages.reservationCount.value).toBe(9);
    expect(week.metrics.reservationContractRate.value).toBeCloseTo(26 / 27, 4);
    expect(week.metrics.nominations.value).toBe(13);
    expect(week.metrics.nominationRate.value).toBe(0.5);
    expect(week.metrics.townPv.value).toBe(16591);
    expect(week.dailyAverages.townPv.value).toBeCloseTo(5530.333, 2);
    expect(week.metrics.townUu.value).toBe(2494);
    expect(week.metrics.heavenAccess.value).toBe(2472);
    expect(week.comparison.sales.status).toBe("UNAVAILABLE");
  });
});
