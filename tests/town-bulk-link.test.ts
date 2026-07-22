import { describe, expect, it } from "vitest";
import { classifyTownBulkLinkEvidence } from "@/lib/imports/town/bulk-link-service";
import { filterTownCCandidates, pageTownCCandidates, townCActionSet } from "@/lib/imports/town/bulk-link-phase1";

const base = {
  idFormat: false,
  correction: false,
  ambiguous: false,
  exactCandidateCount: 0,
  knownDifferenceCandidateCount: 0,
  townAliasConflict: false,
  outsideEnrollmentCandidateCount: 0,
  sourceNameKnown: true,
};

describe("Town CTI-based bulk link classification", () => {
  it("classifies one exact candidate as A", () => {
    expect(classifyTownBulkLinkEvidence({ ...base, exactCandidateCount: 1 })).toEqual({ category: "A", reasonCode: "EXACT_CTI_EVIDENCE" });
  });

  it("classifies one known name difference as B", () => {
    expect(classifyTownBulkLinkEvidence({ ...base, knownDifferenceCandidateCount: 1 })).toEqual({ category: "B", reasonCode: "KNOWN_NAME_DIFFERENCE" });
  });

  it.each([
    [{ idFormat: true }, "ID_FORMAT"],
    [{ correction: true }, "CORRECTION_CANDIDATE"],
    [{ exactCandidateCount: 2 }, "MULTIPLE_CANDIDATES"],
    [{ exactCandidateCount: 1, townAliasConflict: true }, "TOWN_ALIAS_CONFLICT"],
    [{ outsideEnrollmentCandidateCount: 1 }, "OUTSIDE_ENROLLMENT"],
  ])("keeps unsafe evidence in C", (override, reasonCode) => {
    expect(classifyTownBulkLinkEvidence({ ...base, ...override })).toEqual({ category: "C", reasonCode });
  });
});

describe("Town C candidate Phase 1 workspace helpers", () => {
  it("exposes safe actions by reason", () => {
    expect(townCActionSet({ reasonCodes: ["ID_FORMAT"] })).toContain("SOURCE_URL");
    expect(townCActionSet({ reasonCodes: ["MULTIPLE_CANDIDATES"] })).toContain("COMPARE");
    expect(townCActionSet({ reasonCodes: ["NO_CANDIDATE"] })).toEqual(expect.arrayContaining(["EXISTING", "NEW", "PENDING"]));
    expect(townCActionSet({ reasonCodes: ["NO_CANDIDATE"] })).not.toContain("SKIP");
    expect(townCActionSet({ reasonCodes: ["CORRECTION_CANDIDATE"] })).not.toContain("EXISTING");
  });

  it("filters, sorts, and pages candidates without mutating input", () => {
    const candidates = [
      { key: "a", category: "C" as const, townName: "あ", normalizedName: "あ", storeId: "s1", storeName: "春日部", firstDate: "2026-04-01", lastDate: "2026-04-02", rowCount: 3, batchCount: 2, batchIds: ["b1", "b2"], targetCastId: null, targetCastName: null, reason: "候補なし", reasonCodes: ["NO_CANDIDATE"], conflict: false, kindCounts: { cast: 1, url: 1, landing: 1 }, sourceUrls: [] },
      { key: "b", category: "C" as const, townName: "い", normalizedName: "い", storeId: "s2", storeName: "越谷", firstDate: "2026-04-03", lastDate: "2026-04-03", rowCount: 1, batchCount: 1, batchIds: ["b3"], targetCastId: null, targetCastName: null, reason: "ID", reasonCodes: ["ID_FORMAT"], conflict: false, kindCounts: { cast: 1, url: 0, landing: 0 }, sourceUrls: [] },
    ];
    const filtered = filterTownCCandidates(candidates, { reason: "NO_CANDIDATE", storeId: "ALL", query: "", quick: "ALL", sort: "ROWS", hidePlanned: false }, new Set());
    expect(filtered.map((candidate) => candidate.key)).toEqual(["a"]);
    expect(pageTownCCandidates([...candidates, ...candidates], 3, 2)).toMatchObject({ page: 2, pageCount: 2 });
    expect(pageTownCCandidates(candidates, 99, 1)).toMatchObject({ page: 2, pageCount: 2 });
  });
});
