import { describe, expect, it } from "vitest";
import { classifyGlobalLifecycleReview, classifyMergedResources } from "./global-lifecycle-review";
const base = { castId: "c", displayName: "A", status: "ACTIVE", endedOn: null, mergedIntoCastId: null, currentMembershipCount: 0, currentAliasCount: 0, currentListingCount: 0, currentDatasetEvidence: false, duplicateOrMerge: false };
describe("global lifecycle review", () => {
  it("classifies marker and media conflicts", () => { expect(classifyGlobalLifecycleReview({ ...base, displayName: "【退店】A" }).classification).toBe("RETIRED_MARKER_CONFIRMED"); expect(classifyGlobalLifecycleReview({ ...base, currentListingCount: 1 }).classification).toBe("CURRENT_MEDIA_CONFLICT"); });
  it("never infers an end date", () => expect(classifyGlobalLifecycleReview(base).plannedAction).toBe("SET_CAST_INACTIVE"));
  it("excludes normally covered casts from the review universe", () => expect(classifyGlobalLifecycleReview({ ...base, currentMembershipCount: 1 }).classification).toBe("NOT_REVIEW_TARGET"));
  it("separates clean merged sources from P0 state", () => {
    expect(classifyGlobalLifecycleReview({ ...base, mergedIntoCastId: "target" }).classification).toBe("MERGED_SOURCE_CLEAN");
    expect(classifyGlobalLifecycleReview({ ...base, mergedIntoCastId: "target", currentMembershipCount: 1 }).classification).toBe("MERGED_SOURCE_CURRENT_MEMBERSHIP");
  });
  it("plans merged resources independently", () => {
    expect(classifyMergedResources({ sourceMembershipCurrent: true, targetMembershipCurrent: true, sourceListingCurrent: true, targetListingCurrent: false })).toEqual({ membershipAction: "CLOSE_SOURCE_CURRENT_MEMBERSHIP", listingAction: "REVIEW_TARGET_LISTING_MISSING" });
  });
});
