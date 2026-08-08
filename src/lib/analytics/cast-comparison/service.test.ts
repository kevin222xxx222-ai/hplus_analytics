import { describe, expect, it } from "vitest";
import { buildMonthlyFacts } from "@/lib/analytics/cast-diagnosis/engine";
import { comparisonAxisForMetric } from "./metric-axis-map";
import { medianWithEvidence } from "./median";
import { buildCastComparisonAudit } from "./service";
import { selectPeers } from "./peer-selection";
import type { CastRawInput } from "@/lib/analytics/cast-diagnosis/engine";

const row = (castId: string, minutes: number, overrides: Partial<CastRawInput> = {}): CastRawInput => ({
  castId, castName: castId, storeId: "store", storeLabel: "春日部", date: "2026-07-01",
  attendanceCount: 1, attendanceMinutes: minutes, reservations: 1, contracts: 10, mainNominations: 5,
  photoNominations: 2, freeCount: 1, newCount: 0, repeatCount: 8, cancelCount: 0,
  femaleReward: minutes * 50, chargeAmount: minutes * 80, profit: minutes * 10, paidOptionCount: 0,
  townPv: 1000, townUu: 500, heavenPageAccess: 100, heavenDiaryPosts: 2, ...overrides,
});

const facts = (rows: CastRawInput[]) => buildMonthlyFacts(rows);
const twoDays = (castId: string, minutes: number, overrides: Partial<CastRawInput> = {}) => [row(castId, minutes, overrides), row(castId, minutes, { ...overrides, date: "2026-07-02" })];

describe("CA-3.6 cast comparison service", () => {
  it("maps each metric to an explicit axis and rejects unmapped keys", () => {
    expect(comparisonAxisForMetric("townUu")).toBe("MAIN_ATTENDANCE_PEERS");
    expect(comparisonAxisForMetric("photoNominationsPerHour")).toBe("NEW_ACQUISITION_PEERS");
    expect(comparisonAxisForMetric("mainNominationRate")).toBe("REPEAT_CONVERSION_PEERS");
    expect(() => comparisonAxisForMetric("attendanceDays" as never)).toThrow("CAST_METRIC_COMPARISON_AXIS_UNMAPPED");
  });

  it("uses zero as a valid median and records odd/even evidence", () => {
    const odd = medianWithEvidence([{ value: 0, availability: "ZERO" }, { value: null, availability: "MISSING" }]);
    expect(odd.metric).toEqual({ value: 0, availability: "ZERO" });
    expect(odd.method).toBe("ODD_CENTER");
    const even = medianWithEvidence([{ value: 1, availability: "VALUE" }, { value: 3, availability: "VALUE" }, { value: 5, availability: "VALUE" }, { value: 7, availability: "VALUE" }]);
    expect(even.metric.value).toBe(4);
    expect(even.centerValues).toEqual([3, 5]);
    expect(even.centerPositions).toEqual([2, 3]);
  });

  it("expands main-attendance peers from 40% to 60%, then reports insufficient", () => {
    const subject = facts(twoDays("subject", 1200))[0];
    const expanded = facts([...twoDays("subject", 1200), ...twoDays("p1", 600), ...twoDays("p2", 720), ...twoDays("p3", 1800)]);
    const selected = selectPeers("MAIN_ATTENDANCE_PEERS", expanded[0], expanded, "townUu");
    expect(selected.method).toBe("SIMILAR_WORKING_HOURS_60");
    expect(selected.peers).toHaveLength(3);
    const insufficient = selectPeers("MAIN_ATTENDANCE_PEERS", subject, facts([...twoDays("subject", 1200), ...twoDays("only", 600)]), "townUu");
    expect(insufficient.method).toBe("INSUFFICIENT");
  });

  it("does not include unavailable Heaven peers, while retaining ZERO peers", () => {
    const cohort = facts([
      ...twoDays("subject", 1200),
      ...twoDays("zero", 1200, { heavenPageAccess: 0 }),
      ...twoDays("missing", 1200, { heavenPageAccess: undefined }),
      ...twoDays("value", 1200, { heavenPageAccess: 100 }),
    ]);
    const selected = selectPeers("MAIN_ATTENDANCE_PEERS", cohort[0], cohort, "heavenPageAccess");
    expect(selected.peers.map((peer) => peer.castId)).toEqual(expect.arrayContaining(["zero", "value"]));
    expect(selected.peers.some((peer) => peer.castId === "missing")).toBe(false);
  });

  it("records condition-E exclusion evidence without excluding a photo-rich high-nomination cast", () => {
    const cohort = facts([
      ...twoDays("mature", 2400, { femaleReward: 300000, contracts: 20, mainNominations: 12, photoNominations: 2, freeCount: 1 }),
      ...twoDays("photoRich", 2400, { femaleReward: 300000, contracts: 38, mainNominations: 27, photoNominations: 11, freeCount: 0 }),
      ...twoDays("lowHourly", 2400, { femaleReward: 50000, contracts: 20, mainNominations: 12, photoNominations: 2, freeCount: 1 }),
      ...twoDays("p1", 2400), ...twoDays("p2", 2400), ...twoDays("p3", 2400),
    ]);
    const audit = buildCastComparisonAudit({ facts: cohort });
    const mature = audit.newAcquisitionExclusions.find((item) => item.castId === "mature");
    expect(mature?.excludedAsMatureMainNominationCast).toBe(true);
    expect(mature?.matchedConditions).toEqual({ hourlyRewardAtLeast3000: true, mainNominationRateAtLeast50Percent: true, newAcquisitionShareBelow25Percent: true, contractsAtLeast10: true });
    expect(audit.newAcquisitionExclusions.some((item) => item.castId === "photoRich")).toBe(false);
    expect(audit.newAcquisitionExclusions.some((item) => item.castId === "lowHourly")).toBe(false);
  });

  it("marks repeat comparison as REFERENCE_ONLY for a subject below ten contracts", () => {
    const cohort = facts([
      ...twoDays("subject", 1200, { contracts: 4, mainNominations: 2, photoNominations: 1, freeCount: 1 }),
      ...twoDays("p1", 1200), ...twoDays("p2", 1200), ...twoDays("p3", 1200),
    ]);
    const audit = buildCastComparisonAudit({ facts: cohort });
    const comparison = audit.comparisons.find((item) => item.subjectCastId === "subject" && item.metricKey === "mainNominationRate");
    expect(comparison?.axis).toBe("REPEAT_CONVERSION_PEERS");
    expect(comparison?.diagnosticUsage).toBe("REFERENCE_ONLY");
  });
});
