import { describe, expect, it } from "vitest";
import { classifyGlobalLifecycleReview } from "./global-lifecycle-review";
const base = { castId: "c", displayName: "A", status: "ACTIVE", endedOn: null, mergedIntoCastId: null, currentMembershipCount: 0, currentAliasCount: 0, currentListingCount: 0, currentDatasetEvidence: false, duplicateOrMerge: false };
describe("global lifecycle review", () => {
  it("classifies marker and media conflicts", () => { expect(classifyGlobalLifecycleReview({ ...base, displayName: "【退店】A" }).classification).toBe("RETIRED_MARKER_CONFIRMED"); expect(classifyGlobalLifecycleReview({ ...base, currentListingCount: 1 }).classification).toBe("CURRENT_MEDIA_CONFLICT"); });
  it("never infers an end date", () => expect(classifyGlobalLifecycleReview(base).plannedAction).toBe("SET_CAST_INACTIVE"));
});
