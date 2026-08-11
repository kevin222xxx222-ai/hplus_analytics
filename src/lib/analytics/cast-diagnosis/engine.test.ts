import { describe, expect, it } from "vitest";
import { buildCastDiagnosis, buildMonthlyFacts, validateDiagnosisAssignment } from "./engine";

const row = (castId: string, date: string, overrides: Partial<Parameters<typeof buildMonthlyFacts>[0][number]> = {}) => ({ castId, castName: castId, storeId: "store", storeLabel: "春日部", date, attendanceCount: 1, attendanceMinutes: 600, reservations: 1, contracts: 5, mainNominations: 2, photoNominations: 1, freeCount: 2, newCount: 1, repeatCount: 4, cancelCount: 0, femaleReward: 30000, chargeAmount: 50000, profit: 10000, paidOptionCount: 0, townPv: 100, townUu: 100, heavenPageAccess: 20, heavenDiaryPosts: 2, ...overrides });
const days = (castId: string, count: number, overrides: Partial<Parameters<typeof buildMonthlyFacts>[0][number]> = {}) => Array.from({ length: count }, (_, i) => row(castId, `2026-07-${String(i + 1).padStart(2, "0")}`, overrides));

describe("Cast diagnosis CA-1 engine", () => {
  it("integrates same-day multi-store attendance into one day and sums results", () => {
    const facts = buildMonthlyFacts([row("a", "2026-07-01"), row("a", "2026-07-01", { storeId: "other", storeLabel: "越谷" }), row("a", "2026-07-02")]);
    expect(facts[0].attendanceDays.value).toBe(2);
    expect(facts[0].workingHours.value).toBe(30);
    expect(facts[0].contracts.value).toBe(15);
  });

  it("calculates hourly, conversion and share metrics without zero division", () => {
    const fact = buildMonthlyFacts([row("a", "2026-07-01", { contracts: 0, attendanceMinutes: 0, townUu: 0 })])[0];
    expect(fact.hourlyReward.availability).toBe("UNCOMPUTABLE");
    expect(fact.mainNominationRate.availability).toBe("UNCOMPUTABLE");
    expect(fact.photoNominationsPer100Uu.availability).toBe("UNCOMPUTABLE");
  });

  it("creates a 36-to-9 top group with deterministic tie ordering", () => {
    const rows = Array.from({ length: 36 }, (_, i) => row(String(i).padStart(2, "0"), "2026-07-01", { femaleReward: 10000 + i })).flatMap((r) => [r, ...days(r.castId, 3, { femaleReward: r.femaleReward })]);
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) });
    expect(result.comparisonGroup.eligibleCastCount).toBe(36);
    expect(result.comparisonGroup.topGroupCastCount).toBe(9);
  });

  it("does not use unavailable Heaven values as zero", () => {
    const fact = buildMonthlyFacts([row("a", "2026-07-01", { heavenDiaryPosts: undefined })])[0];
    expect(fact.heavenDiaryPosts.value).toBeNull();
    expect(fact.heavenDiaryPosts.availability).toBe("MISSING");
  });

  it("returns insufficient data rather than a strong diagnosis for a small cast", () => {
    const facts = buildMonthlyFacts(days("a", 1));
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts });
    expect(result.casts[0].diagnosis.primaryType).toBe("INSUFFICIENT_DATA");
    expect(result.casts[0].confidence.overall.level).toBe("INSUFFICIENT");
  });

  it("exposes threshold DTO and metric coverage", () => {
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(days("a", 4)) });
    expect(result.thresholds.version).toBe("cast-diagnosis-v1");
    expect(result.comparisonGroup.metricCoverage.some((item) => item.metricKey === "townUu")).toBe(true);
  });

  it("uses the specified two-person top group for five to seven candidates", () => {
    const rows = Array.from({ length: 5 }, (_, i) => days(String(i), 4, { femaleReward: 10000 + i * 1000 })).flat();
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) });
    expect(result.comparisonGroup.eligibleCastCount).toBe(5);
    expect(result.comparisonGroup.topGroupCastCount).toBe(2);
  });

  it("keeps a zero metric valid while keeping an absent medium unavailable", () => {
    const fact = buildMonthlyFacts([row("a", "2026-07-01", { townUu: 0, heavenPageAccess: undefined, heavenDiaryPosts: undefined })])[0];
    expect(fact.townUu).toMatchObject({ value: 0, availability: "ZERO" });
    expect(fact.heavenPageAccess).toMatchObject({ value: null, availability: "UNAVAILABLE" });
  });

  it("adds new-customer acquisition as secondary only when all three valid comparisons are low", () => {
    const peerRows = Array.from({ length: 8 }, (_, i) => days(`p${i}`, 4, { femaleReward: 40000, townUu: 1000, photoNominations: 10, heavenDiaryPosts: 10 })).flat();
    const targetRows = days("target", 4, { femaleReward: 10000, townUu: 100, photoNominations: 0, heavenDiaryPosts: 0 });
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts([...peerRows, ...targetRows]) });
    expect(result.casts.find((c) => c.fact.castId === "target")?.diagnosis.secondaryTypes).toContain("LOW_NEW_CUSTOMER_ACQUISITION");
  });

  it("uses a deterministic fallback when the monthly group is too small", () => {
    const facts = buildMonthlyFacts([days("a", 4), days("b", 4), days("c", 4), days("d", 2)].flat());
    const rollingFacts = buildMonthlyFacts([days("a", 4, { femaleReward: 50000 }), days("b", 4, { femaleReward: 45000 }), days("c", 4, { femaleReward: 40000 })].flat());
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts, rollingFacts });
    expect(result.comparisonGroup.method).toBe("ROLLING_THREE_MONTH_MANAGED_MEDIAN");
  });

  it("keeps OTHER_REVIEW as a defined fallback and emits a fact", () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => days(`peer${i}`, 4, { femaleReward: 50000, photoNominations: 10 })), days("target", 4, { femaleReward: 50000, photoNominations: 1, mainNominations: 0 })].flat();
    const target = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) }).casts.find((c) => c.fact.castId === "target");
    expect(target).toBeDefined();
    expect(target?.diagnosis.primaryType).toBe("OTHER_REVIEW");
    expect(target?.diagnosis.facts.length).toBeGreaterThan(0);
    expect(validateDiagnosisAssignment(target!).valid).toBe(true);
  });

  it("exposes deterministic comparison source and separates all/main summaries", () => {
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts([...days("main", 2), days("non-main", 1)].flat()) });
    expect(result.summary.totalFactCastCount).toBe(2);
    expect(result.summary.nonMainAttendanceCastCount).toBe(1);
    expect(result.summary.mainAttendanceDiagnosisCounts.INSUFFICIENT_DATA).toBe(1);
    expect(result.casts.every((c) => c.comparisonSource.medianSourceLabel.length > 0)).toBe(true);
  });

  it("reports distinct insufficient-data reasons without treating zero as missing", () => {
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts([row("zero", "2026-07-01", { attendanceCount: 0, attendanceMinutes: 0 }), ...days("one", 1)].flat()) });
    expect(result.summary.insufficientBreakdown.byPrimaryReason.ATTENDANCE_0_DAYS).toBe(1);
    expect(result.summary.insufficientBreakdown.byPrimaryReason.ATTENDANCE_1_DAY).toBe(1);
    expect(result.casts.find((c) => c.fact.castId === "zero")?.fact.attendanceDays.availability).toBe("ZERO");
  });

  it("validates every primary assignment in a mixed cohort", () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => days(`peer${i}`, 4, { femaleReward: 50000 })), days("small", 1), days("profile", 4, { femaleReward: 10000, townUu: 500, photoNominations: 0, mainNominations: 1 })].flat();
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) });
    expect(result.casts.flatMap((cast) => validateDiagnosisAssignment(cast).violations)).toEqual([]);
  });

  it("classifies a high-efficiency low-sample cast as stable, while confidence stays conservative", () => {
    const peers = Array.from({ length: 8 }, (_, i) => days(`peer${i}`, 4, { femaleReward: 40000, mainNominations: 4, contracts: 10 }));
    const yua = [row("yua", "2026-07-01", { femaleReward: 66500, contracts: 8, mainNominations: 4, photoNominations: 4 }), row("yua", "2026-07-02", { femaleReward: 66500, contracts: 0, mainNominations: 0, photoNominations: 0 }), row("yua", "2026-07-03", { femaleReward: 66500, contracts: 0, mainNominations: 0, photoNominations: 0 })];
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts([...peers, yua].flat()) });
    const cast = result.casts.find((item) => item.fact.castId === "yua")!;
    expect(cast.diagnosis.primaryType).toBe("STABLE_HIGH_EFFICIENCY");
    expect(cast.confidence.overall.level).toBe("LOW");
    expect(cast.diagnosis.facts.some((fact) => fact.statement.includes("成約8本を母数"))).toBe(true);
    expect(cast.diagnosis.reviewTargets).toEqual(["NONE"]);
    expect(cast.diagnosis.otherReviewReason).toBeNull();
  });

  it("uses the relaxed candidate rule but excludes accidental short samples", () => {
    const rows = [days("fourDays", 4), days("twentyHours", 2), days("fiveContracts", 1, { contracts: 5 }), days("short", 1, { attendanceMinutes: 60, contracts: 20 }), days("accidental", 1, { attendanceMinutes: 600, contracts: 1 })].flat();
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) });
    expect(result.casts.find((c) => c.fact.castId === "fourDays")?.isComparisonEligible).toBe(true);
    expect(result.casts.find((c) => c.fact.castId === "twentyHours")?.isComparisonEligible).toBe(true);
    expect(result.casts.find((c) => c.fact.castId === "fiveContracts")?.isComparisonEligible).toBe(true);
    expect(result.casts.find((c) => c.fact.castId === "short")?.isComparisonEligible).toBe(false);
    expect(result.casts.find((c) => c.fact.castId === "accidental")?.isComparisonEligible).toBe(false);
  });

  it("does not use the subject cast in a peer median", () => {
    const rows = [...Array.from({ length: 8 }, (_, i) => days(`peer${i}`, 4, { femaleReward: 30000 + i * 1000 })), days("target", 4, { femaleReward: 100000 })].flat();
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) });
    const cast = result.casts.find((c) => c.fact.castId === "target")!;
    expect(cast.comparisons.every((comparison) => comparison.peerCoverage.eligiblePeerCount === comparison.validPeerCount)).toBe(true);
    expect(cast.comparisons.find((comparison) => comparison.metricKey === "hourlyReward")?.peerMedianMetric.value).not.toBe(cast.fact.hourlyReward.value);
  });

  it("connects diagnosis metrics to the shared metric-specific axes", () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => days(`peer${i}`, 4, { femaleReward: 50000, townUu: 1000, photoNominations: 8, mainNominations: 5, contracts: 10 })), days("target", 4, { femaleReward: 30000, townUu: 500, photoNominations: 2, mainNominations: 1, contracts: 10 })].flat();
    const target = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts(rows) }).casts.find((cast) => cast.fact.castId === "target")!;
    expect(target.comparisons.find((comparison) => comparison.metricKey === "townUu")?.comparisonAxis).toBe("MAIN_ATTENDANCE_PEERS");
    expect(target.comparisons.find((comparison) => comparison.metricKey === "photoNominationsPerHour")?.comparisonAxis).toBe("NEW_ACQUISITION_PEERS");
    expect(target.comparisons.find((comparison) => comparison.metricKey === "mainNominationRate")?.comparisonAxis).toBe("REPEAT_CONVERSION_PEERS");
    expect(target.comparisons.find((comparison) => comparison.metricKey === "hourlyReward")?.comparisonAxis).toBe("RESULT_TOP_PEERS");
    expect(target.comparisons.find((comparison) => comparison.metricKey === "heavenMyGirlAdds")?.comparisonAxis).toBe("MAIN_ATTENDANCE_PEERS");
    expect(target.comparisons.find((comparison) => comparison.metricKey === "heavenFavoriteTalksPerAttendanceDay")?.comparisonAxis).toBe("MAIN_ATTENDANCE_PEERS");
  });

  it("keeps repeat conversion sample gating while allowing stable diagnosis below ten contracts", () => {
    const peers = Array.from({ length: 16 }, (_, i) => days(`peer${i}`, 4, { femaleReward: 45000, photoNominations: 10, contracts: 10, mainNominations: 5 }));
    const lowRepeat = [row("lowRepeat", "2026-07-01", { femaleReward: 60000, contracts: 8, mainNominations: 4, photoNominations: 4 }), row("lowRepeat", "2026-07-02", { femaleReward: 60000, contracts: 0, mainNominations: 0, photoNominations: 0 }), row("lowRepeat", "2026-07-03", { femaleReward: 60000, contracts: 0, mainNominations: 0, photoNominations: 0 })];
    const result = buildCastDiagnosis({ period: { from: "2026-07-01", to: "2026-07-31" }, facts: buildMonthlyFacts([...peers.flat(), ...lowRepeat]) });
    const cast = result.casts.find((item) => item.fact.castId === "lowRepeat")!;
    expect(cast.diagnosis.primaryType).not.toBe("LOW_REPEAT_CONVERSION");
  });
});
