export type LifecycleReviewInput = {
  castId: string;
  displayName: string;
  status: string;
  endedOn: Date | null;
  mergedIntoCastId: string | null;
  currentMembershipCount: number;
  currentAliasCount: number;
  currentListingCount: number;
  currentDatasetEvidence: boolean;
  duplicateOrMerge?: boolean;
};

/** Classifies only the global-lifecycle review universe (not every Cast). */
export function classifyGlobalLifecycleReview(input: LifecycleReviewInput) {
  const marker = /退店|休業/.test(input.displayName);
  const merged = Boolean(input.mergedIntoCastId || input.duplicateOrMerge);

  // A merged source with no current state is historical and requires no action.
  if (merged) {
    if (input.currentMembershipCount === 0 && input.currentAliasCount === 0 && input.currentListingCount === 0) {
      return { classification: "MERGED_SOURCE_CLEAN", candidateForGlobalInactive: false, plannedAction: "NO_ACTION" } as const;
    }
    const hasMembership = input.currentMembershipCount > 0;
    const hasMedia = input.currentAliasCount > 0 || input.currentListingCount > 0;
    if (hasMembership && hasMedia) return { classification: "MERGED_SOURCE_CURRENT_MEMBERSHIP_AND_MEDIA", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
    if (hasMembership) return { classification: "MERGED_SOURCE_CURRENT_MEMBERSHIP", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
    return { classification: "MERGED_SOURCE_CURRENT_MEDIA", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
  }

  // Normal, currently covered Casts are outside this review universe.
  if (input.status !== "ACTIVE" || input.currentMembershipCount > 0) {
    return { classification: "NOT_REVIEW_TARGET", candidateForGlobalInactive: false, plannedAction: "NO_ACTION" } as const;
  }
  if (input.currentAliasCount > 0 || input.currentListingCount > 0 || input.currentDatasetEvidence) {
    return { classification: "CURRENT_MEDIA_CONFLICT", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
  }
  if (marker) return { classification: "RETIRED_MARKER_CONFIRMED", candidateForGlobalInactive: true, plannedAction: "SET_CAST_INACTIVE" } as const;
  return { classification: "NO_CURRENT_EVIDENCE", candidateForGlobalInactive: true, plannedAction: "SET_CAST_INACTIVE" } as const;
}

export type MergedResourceInput = {
  sourceMembershipCurrent: boolean;
  targetMembershipCurrent: boolean;
  sourceListingCurrent: boolean;
  targetListingCurrent: boolean;
};

export function classifyMergedResources(input: MergedResourceInput) {
  return {
    membershipAction: input.sourceMembershipCurrent
      ? input.targetMembershipCurrent ? "CLOSE_SOURCE_CURRENT_MEMBERSHIP" : "REVIEW_TARGET_MEMBERSHIP_MISSING"
      : "NO_ACTION",
    listingAction: input.sourceListingCurrent
      ? input.targetListingCurrent ? "CLOSE_SOURCE_CURRENT_LISTING" : "REVIEW_TARGET_LISTING_MISSING"
      : "NO_ACTION",
  } as const;
}
