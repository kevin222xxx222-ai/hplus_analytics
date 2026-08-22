import { describe, expect, it } from "vitest";
import { ImportBatchStatus } from "@/generated/prisma/client";
import { classifyCurrentMembershipDecision, summarizeCurrentMembershipCandidates, type CurrentMembershipCandidate } from "./current-membership-evidence";

const evidence = (extra = {}) => ({ ctiCurrent: false, townCurrent: false, reasons: [], ...extra });

describe("current membership evidence decision", () => {
  it("requires latest CTI/Town positive evidence", () => {
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", evidence: evidence({ townCurrent: true }) })).toBe("CREATE_ACTIVE");
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", evidence: evidence() })).toBe("NO_EVIDENCE");
  });
  it("does not create from Heaven, alias or listing-only evidence", () => {
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", evidence: evidence({ reasons: ["Heaven累計Fact（補足・自動初期化対象外）"] }) })).toBe("HEAVEN_CURRENT_REVIEW");
  });
  it("routes marker, inactive, and re-entry conflicts to review", () => {
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A【退店】", evidence: evidence({ ctiCurrent: true }) })).toBe("LEGACY_STATUS_CONFLICT");
    expect(classifyCurrentMembershipDecision({ castStatus: "INACTIVE", displayName: "A", evidence: evidence({ townCurrent: true }) })).toBe("LEGACY_STATUS_CONFLICT");
    expect(classifyCurrentMembershipDecision({ castStatus: "ACTIVE", displayName: "A", membershipStatus: "LEFT", evidence: evidence({ townCurrent: true }) })).toBe("REENTRY_REVIEW");
  });
});

describe("current membership audit summary", () => {
  const candidate = (overrides: Partial<CurrentMembershipCandidate>): CurrentMembershipCandidate => ({
    castId: crypto.randomUUID(), storeId: crypto.randomUUID(), displayName: "A", storeName: "春日部", decision: "CREATE_ACTIVE",
    evidence: { ctiCurrent: false, townCurrent: true, mediaListingEvidence: false, aliasEvidence: false, latestFactEvidence: true, latestFactDate: null, latestSuccessfulImportDate: null, latestSuccessfulImportBatchId: null, ctiDataset: null, townDataset: { date: new Date("2026-08-20"), batchId: crypto.randomUUID(), status: "COMPLETED", fileName: "town.csv" }, reasons: [] },
    ...overrides,
  });
  it("counts Town only, CTI only, both and validates equations", () => {
    const result = summarizeCurrentMembershipCandidates([
      candidate({}),
      candidate({ castId: crypto.randomUUID(), storeName: "越谷", evidence: { ...candidate({}).evidence, townCurrent: false, ctiCurrent: true, townDataset: null, ctiDataset: { date: new Date("2026-08-20"), batchId: crypto.randomUUID(), status: "COMPLETED_WITH_WARNINGS", fileName: "cti.xlsx" } } }),
      candidate({ castId: crypto.randomUUID(), storeName: "野田", evidence: { ...candidate({}).evidence, ctiCurrent: true, ctiDataset: { date: new Date("2026-08-20"), batchId: crypto.randomUUID(), status: "COMPLETED", fileName: "cti.xlsx" } } }),
    ]);
    expect(result.createActiveTotal).toBe(3);
    expect(result.townOnly).toBe(1);
    expect(result.ctiOnly).toBe(1);
    expect(result.both).toBe(1);
    expect(result.invalidBatchStatusCount).toBe(0);
    expect(Object.values(result.storeCounts).reduce((sum, count) => sum + count, 0)).toBe(3);
  });
  it("detects an invalid batch status and duplicate cast/store", () => {
    const first = candidate({});
    const duplicate = candidate({ castId: first.castId, storeId: first.storeId, evidence: { ...first.evidence, townDataset: { ...first.evidence.townDataset!, status: ImportBatchStatus.PREVIEW_READY } } });
    const result = summarizeCurrentMembershipCandidates([first, duplicate]);
    expect(result.duplicateCastStoreCount).toBe(1);
    expect(result.invalidBatchStatusCount).toBe(1);
  });
});
