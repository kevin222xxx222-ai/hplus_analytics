import { describe, expect, it } from "vitest";
import { aggregateVolume } from "@/lib/analytics/engine";
import { buildDailyCharts, buildRelationshipCharts, buildStoryCards, buildStorySections } from "./management-dashboard";

describe("Management Dashboard foundation contracts", () => {
  it("uses formal CTI contractCount independently from reservations", () => {
    const summary = aggregateVolume([{ date: "2026-07-01", storeId: "store", castId: "cast", media: "CTI", naturalKey: "cti-1", metrics: { reservations: 8, contracts: 3, attendancePeople: 1, attendanceMinutes: 60, sales: 30000, services: 3 } }])[0];
    expect(summary.metrics.reservations).toBe(8);
    expect(summary.metrics.contracts).toBe(3);
    expect(summary.metrics.reservations).not.toBe(summary.metrics.contracts);
  });

  it("keeps missing metrics distinct from observed zero", () => {
    const summary = aggregateVolume([{ date: "2026-07-01", storeId: "store", castId: "cast", media: "CTI", naturalKey: "cti-zero", metrics: { contracts: 0, reservations: 0, attendancePeople: 1, attendanceMinutes: 60 } }])[0];
    expect(summary.metricAvailability.contracts).toBe("ZERO");
    expect(summary.metricAvailability.sales).toBe("MISSING");
  });

  it("builds the official daily charts without out-of-scope media series", () => {
    const input = { from: "2026-07-01", to: "2026-07-03", stores: [{ id: "kas", code: "KASUKABE", name: "春日部", shortName: "春日部" }, { id: "kos", code: "KOSHIGAYA", name: "越谷", shortName: "越谷" }, { id: "noda", code: "NODA", name: "野田", shortName: "野田" }], casts: [], rows: [{ date: "2026-07-01", storeId: "kas", castId: "cast", media: "CTI", naturalKey: "cti-1", metrics: { sales: 10000, contracts: 1, attendancePeople: 1, attendanceMinutes: 60, regularNominations: 0, services: 1 } }, { date: "2026-07-01", storeId: "kos", castId: "cast", media: "CTI", naturalKey: "cti-2", metrics: { sales: 5000, contracts: 2, attendancePeople: 1, attendanceMinutes: 120, regularNominations: 1, services: 2 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "TOWN", naturalKey: "town-1", metrics: { townPv: 20, townUu: 10 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "HEAVEN", naturalKey: "heaven-1", metrics: { heavenAccess: 8, heavenDiaryPosts: 2, heavenMiteneSent: 1 } }], } as Parameters<typeof buildDailyCharts>[0];
    const charts = buildDailyCharts(input, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-03T00:00:00Z"));
    expect(charts).toHaveLength(11);
    expect(charts.find((chart) => chart.chartId === "town-pv-daily")?.series.map((series) => series.storeName)).toEqual(["全体", "春日部", "越谷"]);
    expect(charts.find((chart) => chart.chartId === "heaven-access-daily")?.series.map((series) => series.storeName)).toEqual(["春日部"]);
    expect(charts.find((chart) => chart.chartId === "sales-daily")?.series[0]?.values[2]?.value).toBeNull();
  });

  it("builds ordered story sections with independent scoped charts", () => {
    const input = { from: "2026-07-01", to: "2026-07-02", stores: [{ id: "kas", code: "KASUKABE", name: "春日部", shortName: "春日部" }, { id: "kos", code: "KOSHIGAYA", name: "越谷", shortName: "越谷" }, { id: "noda", code: "NODA", name: "野田", shortName: "野田" }], casts: [], rows: [{ date: "2026-07-01", storeId: "kas", castId: "cast", media: "CTI", naturalKey: "cti-1", metrics: { sales: 10000, contracts: 1, attendancePeople: 1, attendanceMinutes: 60 } }, { date: "2026-07-01", storeId: "kos", castId: "cast", media: "CTI", naturalKey: "cti-2", metrics: { sales: 5000, contracts: 2, attendancePeople: 1, attendanceMinutes: 120 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "TOWN", naturalKey: "town-1", metrics: { townPv: 20, townUu: 10 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "HEAVEN", naturalKey: "heaven-1", metrics: { heavenAccess: 8, heavenDiaryPosts: 2 } }], } as Parameters<typeof buildDailyCharts>[0];
    const sections = buildStorySections(buildDailyCharts(input, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-02T00:00:00Z")));
    expect(sections.map((section) => section.storyId)).toEqual(["sales_outcome", "operations_outcome", "town_funnel", "heaven_funnel", "nomination"]);
    expect(sections.find((section) => section.storyId === "town_funnel")?.scopeBlocks.map((scope) => scope.scopeLabel)).toEqual(["全体", "春日部", "越谷"]);
    expect(sections.find((section) => section.storyId === "heaven_funnel")?.scopeBlocks.map((scope) => scope.scopeLabel)).toEqual(["春日部"]);
    expect(sections.flatMap((section) => section.scopeBlocks.flatMap((scope) => scope.charts.map((chart) => chart.title))).some((title) => title.includes("売上／時間") || title.includes("平均単価"))).toBe(false);
  });

  it("builds dual-axis relationships with fixed axes and direction summary", () => {
    const input = { from: "2026-07-01", to: "2026-07-03", stores: [{ id: "kas", code: "KASUKABE", name: "春日部", shortName: "春日部" }, { id: "kos", code: "KOSHIGAYA", name: "越谷", shortName: "越谷" }, { id: "noda", code: "NODA", name: "野田", shortName: "野田" }], casts: [], rows: [{ date: "2026-07-01", storeId: "kas", castId: "cast", media: "CTI", naturalKey: "cti-1", metrics: { sales: 100, contracts: 1, attendancePeople: 1, attendanceMinutes: 60, regularNominations: 1 } }, { date: "2026-07-02", storeId: "kas", castId: "cast", media: "CTI", naturalKey: "cti-2", metrics: { sales: 200, contracts: 2, attendancePeople: 1, attendanceMinutes: 60, regularNominations: 2 } }, { date: "2026-07-03", storeId: "kas", castId: "cast", media: "CTI", naturalKey: "cti-3", metrics: { sales: 100, contracts: 1, attendancePeople: 1, attendanceMinutes: 60, regularNominations: 1 } }], } as Parameters<typeof buildDailyCharts>[0];
    const relationships = buildRelationshipCharts(buildDailyCharts(input, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-03T00:00:00Z")));
    const salesContract = relationships.find((chart) => chart.relationshipId === "sales_contract" && chart.scope.scopeId === "kasukabe");
    expect(salesContract?.leftAxis.renderType).toBe("bar"); expect(salesContract?.rightAxis.renderType).toBe("line"); expect(salesContract?.values[1]?.previousDayDirection).toBe("same"); expect(salesContract?.values[2]?.previousDayDirection).toBe("same"); expect(salesContract?.relationshipSummary.directionMatchRate).toBe(1);
    expect(relationships.some((chart) => chart.relationshipId === "sales_working_hours" && chart.scope.scopeId === "overall")).toBe(true);
    expect(relationships.some((chart) => chart.relationshipId === "sales_working_hours" && chart.scope.scopeId === "koshigaya")).toBe(false);
  });

  it("builds the v2 story card contract in the prescribed order and scope", () => {
    const input = { from: "2026-07-01", to: "2026-07-03", stores: [{ id: "kas", code: "KASUKABE", name: "春日部", shortName: "春日部" }, { id: "kos", code: "KOSHIGAYA", name: "越谷", shortName: "越谷" }, { id: "noda", code: "NODA", name: "野田", shortName: "野田" }], casts: [], rows: [{ date: "2026-07-01", storeId: "kas", castId: "cast", media: "CTI", naturalKey: "cti-1", metrics: { sales: 100, contracts: 1, reservations: 2, attendancePeople: 1, attendanceMinutes: 60, regularNominations: 1 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "TOWN", naturalKey: "town-1", metrics: { townPv: 20, townUu: 10 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "HEAVEN", naturalKey: "heaven-1", metrics: { heavenAccess: 8, heavenDiaryPosts: 2 } }], } as Parameters<typeof buildDailyCharts>[0];
    const relationships = buildRelationshipCharts(buildDailyCharts(input, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-03T00:00:00Z")));
    const metric = (value: number | null) => ({ value, availability: value === null ? "MISSING" : "VALUE", confidence: "High", sample: {} });
    const summary = { sales: metric(100), contractCount: metric(1), reservationCount: metric(2), averageDailyAttendance: metric(1), workingHours: metric(1), nominationCount: metric(1), nominationRate: metric(0.5) } as never;
    const store = { storeId: "kas", storeName: "春日部", storeCode: "KASUKABE", volume: { sales: metric(100), contracts: metric(1), reservations: metric(2), workHours: metric(1), nominationCount: metric(1) }, sample: { averageDailyAttendance: metric(1) }, efficiency: { nominationRate: metric(0.5) }, media: { townUu: metric(10), heavenAccess: metric(8), heavenDiaryPosts: metric(2) } } as never;
    const cards = buildStoryCards(relationships, summary, [store], [], buildDailyCharts(input, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-03T00:00:00Z")));
    expect(cards.map((card) => card.storyId)).toEqual(["sales_trend", "sales_trend", "sales_trend", "sales_trend", "sales_outcome", "sales_outcome", "sales_operations", "town_performance", "town_performance", "heaven_performance", "town_performance", "sales_nomination", "sales_nomination"]);
    expect(cards.find((card) => card.storyId === "sales_operations")?.charts).toHaveLength(2);
    expect(cards.find((card) => card.storyId === "heaven_performance")?.charts).toHaveLength(3);
    expect(cards.every((card) => card.headlineMetrics.length <= 3)).toBe(true);
  });

  it("uses Town PV for the cross-media relationship and omits unsupported OKINI charts", () => {
    const input = { from: "2026-07-01", to: "2026-07-02", stores: [{ id: "kas", code: "KASUKABE", name: "春日部", shortName: "春日部" }], casts: [], rows: [{ date: "2026-07-01", storeId: "kas", castId: "cast", media: "TOWN", naturalKey: "town-1", metrics: { townPv: 20, townUu: 10 } }, { date: "2026-07-01", storeId: "kas", castId: "cast", media: "HEAVEN", naturalKey: "heaven-1", metrics: { heavenAccess: 8, heavenDiaryPosts: 2, heavenMiteneSent: 1 } }], } as Parameters<typeof buildDailyCharts>[0];
    const relationships = buildRelationshipCharts(buildDailyCharts(input, new Date("2026-07-01T00:00:00Z"), new Date("2026-07-02T00:00:00Z")));
    const crossMedia = relationships.find((chart) => chart.relationshipId === "town_heaven_access");
    expect(crossMedia?.leftAxis.label).toBe("Town PV");
    expect(crossMedia?.rightAxis.label).toBe("Heaven PAGE_ACCESS");
    expect(relationships.some((chart) => chart.relationshipId === "page_access_okini")).toBe(false);
  });
});
