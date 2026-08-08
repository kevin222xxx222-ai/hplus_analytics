import { describe, expect, it } from "vitest";
import { auditAliasRows, buildMonthlyAudits, monthStatus, monthStarts, summarizeAvailability } from "./audit";

const fact = (overrides: Record<string, unknown> = {}) => ({
  castId: "cast-1", castName: "テスト", storeIds: [], storeLabels: [],
  attendanceDays: { value: 2, availability: "VALUE" }, workingHours: { value: 10, availability: "VALUE" }, reservations: { value: 0, availability: "ZERO" }, contracts: { value: 0, availability: "ZERO" },
  mainNominations: { value: 0, availability: "ZERO" }, photoNominations: { value: 0, availability: "ZERO" }, freeCount: { value: 0, availability: "ZERO" }, newCount: { value: 0, availability: "ZERO" }, repeatCount: { value: 0, availability: "ZERO" }, cancelCount: { value: 0, availability: "ZERO" },
  femaleReward: { value: 1000, availability: "VALUE" }, chargeAmount: { value: 0, availability: "ZERO" }, profit: { value: 0, availability: "ZERO" }, paidOptionCount: { value: 0, availability: "ZERO" }, townPv: { value: null, availability: "MISSING" }, townUu: { value: null, availability: "MISSING" }, heavenPageAccess: { value: null, availability: "UNAVAILABLE" }, heavenDiaryPosts: { value: null, availability: "MISSING" },
  hourlyReward: { value: null, availability: "UNCOMPUTABLE" }, contractsPerDay: { value: 0, availability: "ZERO" }, contractsPerHour: { value: 0, availability: "ZERO" }, photoNominationsPerDay: { value: 0, availability: "ZERO" }, photoNominationsPerHour: { value: 0, availability: "ZERO" }, photoNominationsPer100Uu: { value: null, availability: "UNCOMPUTABLE" }, mainNominationRate: { value: null, availability: "UNCOMPUTABLE" }, photoNominationShare: { value: null, availability: "UNCOMPUTABLE" }, repeatShare: { value: null, availability: "UNCOMPUTABLE" },
  ...overrides,
});

describe("cast monthly trend audit primitives", () => {
  it("creates month boundaries and marks the current month partial", () => {
    expect(monthStarts("2026-04-12", "2026-08-31")).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(monthStatus("2026-07", new Date("2026-08-05T00:00:00Z"))).toBe("COMPLETE");
    expect(monthStatus("2026-08", new Date("2026-08-05T00:00:00Z"))).toBe("PARTIAL");
  });

  it("keeps zero separate from missing and unavailable", () => {
    const audits = buildMonthlyAudits({ months: [{ month: "2026-07", result: { casts: [{ fact: fact() }] } as never }], casts: [{ id: "cast-1", displayName: "テスト", startedOn: "2026-01-01", endedOn: null }], asOf: new Date("2026-08-05T00:00:00Z") });
    expect(summarizeAvailability(audits, "contracts")).toMatchObject({ ZERO: 1, MISSING: 0 });
    expect(summarizeAvailability(audits, "townUu")).toMatchObject({ MISSING: 1, ZERO: 0 });
    expect(summarizeAvailability(audits, "heavenPageAccess")).toMatchObject({ UNAVAILABLE: 1 });
  });

  it("audits aliases, unresolved rows, and invalid validity ranges", () => {
    const result = auditAliasRows([
      { castId: "cast-1", aliasName: "まゆ", reviewStatus: "MAPPED", validFrom: "2026-01-01", validTo: "2026-12-31" },
      { castId: "cast-1", aliasName: "まゆ☆", reviewStatus: "MAPPED", validFrom: "2026-07-01", validTo: "2026-06-30" },
      { castId: null, aliasName: "未紐付", reviewStatus: "PENDING", validFrom: null, validTo: null },
    ]);
    expect(result.find((row) => row.castId === "cast-1")).toMatchObject({ aliasCount: 2, validRangeIssues: 1 });
    expect(result.find((row) => row.castId === null)).toMatchObject({ unresolvedCount: 1 });
  });
});
