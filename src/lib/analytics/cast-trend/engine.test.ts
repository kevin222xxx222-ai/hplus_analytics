import { describe, expect, it } from "vitest";
import { buildCastTrend } from "./engine";
import type { TrendMonthlyInput } from "./types";

const cast = (id: string, name: string, values: Partial<Record<string, { value: number | null; availability: string }>> = {}) => ({ fact: { castId: id, castName: name, storeIds: [], storeLabels: [], ...Object.fromEntries(["femaleReward", "hourlyReward", "contracts", "attendanceDays", "workingHours", "contractsPerDay", "contractsPerHour", "townPv", "townUu", "heavenPageAccess", "heavenDiaryPosts", "photoNominations", "photoNominationShare", "photoNominationsPerHour", "photoNominationsPer100Uu", "mainNominations", "mainNominationRate", "repeatCount", "repeatShare"].map((key) => [key, values[key] ?? { value: null, availability: "MISSING" }])) } as never, diagnosis: { primaryType: "OTHER_REVIEW", label: "その他確認", summary: "", steps: {} }, confidence: { overall: { level: "HIGH" } } } as never);
const input = (month: string, c: ReturnType<typeof cast>, status: "COMPLETE" | "PARTIAL" = "COMPLETE"): TrendMonthlyInput => ({ month, periodFrom: `${month}-01`, periodTo: `${month}-28`, status, cast: c, diagnosisIncluded: true, actionIncluded: false, activeFrom: "2026-01-01", activeTo: null, calendarDaysInMonth: 30 });

describe("cast trend engine", () => {
  it("creates previous comparisons, rolling averages, extrema and direction", () => {
    const points = [10, 12, 15].map((value, index) => input(`2026-0${index + 1}`, cast("c1", "テスト", { hourlyReward: { value, availability: "VALUE" } })));
    const result = buildCastTrend({ castId: "c1", displayName: "テスト", storeLabels: [], period: { from: "2026-01-01", to: "2026-03-31" }, months: points });
    expect(result.summaries.hourlyReward.direction).toBe("RISING");
    expect(result.summaries.hourlyReward.rolling3.value).toBeCloseTo(12.333333333333336);
    expect(result.summaries.hourlyReward.rolling3).toMatchObject({ validMonthCount: 3, availability: "VALUE" });
    expect(result.summaries.hourlyReward.extrema.highest?.value).toBe(15);
    expect(result.months[2].previous.hourlyReward.percentageChange).toBeCloseTo(0.25);
  });

  it("does not skip a missing month for previous comparison", () => {
    const result = buildCastTrend({ castId: "c1", displayName: "テスト", storeLabels: [], period: { from: "2026-01-01", to: "2026-03-31" }, months: [input("2026-01", cast("c1", "テスト", { hourlyReward: { value: 10, availability: "VALUE" } })), input("2026-02", cast("c1", "テスト")), input("2026-03", cast("c1", "テスト", { hourlyReward: { value: 20, availability: "VALUE" } }))] });
    expect(result.months[2].previous.hourlyReward.availability).toBe("NO_PREVIOUS_VALUE");
  });

  it("keeps a partial month out of confirmed direction and marks provisional record", () => {
    const result = buildCastTrend({ castId: "c1", displayName: "テスト", storeLabels: [], period: { from: "2026-01-01", to: "2026-04-05" }, months: [input("2026-01", cast("c1", "テスト", { hourlyReward: { value: 10, availability: "VALUE" } })), input("2026-02", cast("c1", "テスト", { hourlyReward: { value: 12, availability: "VALUE" } })), input("2026-03", cast("c1", "テスト", { hourlyReward: { value: 14, availability: "VALUE" } })), input("2026-04", cast("c1", "テスト", { hourlyReward: { value: 30, availability: "VALUE" } }), "PARTIAL")] });
    expect(result.months[3].records.hourlyReward).toBe("PROVISIONAL_HIGHEST");
    expect(result.months[3].direction.hourlyReward).toBe("RISING");
  });
});
