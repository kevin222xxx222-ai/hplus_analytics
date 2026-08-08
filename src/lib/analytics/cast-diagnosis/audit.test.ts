import { describe, expect, it } from "vitest";
import { buildCastDiagnosis, buildMonthlyFacts } from "./engine";
import { buildCastDiagnosisAuditReport } from "./audit";

const row = (castId: string, date: string, reward = 30000) => ({ castId, castName: castId, storeId: "store", storeLabel: "春日部", date, attendanceCount: 1, attendanceMinutes: 600, reservations: 1, contracts: 10, mainNominations: 5, photoNominations: 2, freeCount: 1, newCount: 0, repeatCount: 8, cancelCount: 0, femaleReward: reward, chargeAmount: 50000, profit: 10000, paidOptionCount: 0, townPv: 1000, townUu: 500, heavenPageAccess: 100, heavenDiaryPosts: 2 });
const facts = buildMonthlyFacts(Array.from({ length: 8 }, (_, index) => Array.from({ length: 4 }, (_, day) => row(`peer${index}`, `2026-07-${String(day + 1).padStart(2, "0")}`, 40000))).flat());

describe("Cast diagnosis audit", () => {
  it("reports axis and facts consistency without changing diagnosis counts", () => {
    const baseline = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts, comparisonMode: "LEGACY_RESULT_TOP_ONLY" });
    const current = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts, comparisonMode: "AXIS_SPECIFIC" });
    const report = buildCastDiagnosisAuditReport(baseline, current, { from: "2026-07-01", to: "2026-07-31" });
    expect(report.axisAudit.mismatchCount).toBe(0);
    expect(report.factsAudit.mismatchCount).toBe(0);
    expect(report.validation.invalidCastCount).toBe(0);
    expect(Object.values(report.summary.currentDiagnosisCounts).reduce((sum, count) => sum + count, 0)).toBe(facts.length);
  });
});
