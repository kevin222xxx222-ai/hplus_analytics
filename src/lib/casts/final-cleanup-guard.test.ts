import { describe, expect, it } from "vitest";
import { isMergedP0Source, validateMergedCleanupCandidate } from "./final-cleanup-guard";
describe("final cleanup guard", () => {
  it("excludes clean merged sources", () => expect(isMergedP0Source({ mergedIntoCastId: "t", currentMembershipCount: 0, currentListingCount: 0 })).toBe(false));
  it("requires equivalent target resources", () => expect(validateMergedCleanupCandidate({ mergedIntoCastId: "t", sourceMembershipCount: 1, sourceListingCount: 1, targetHasEquivalentMembership: false, targetHasEquivalentListing: true, targetHasLeftMembership: false, mergedAt: new Date() }).applyEligible).toBe(false));
});
