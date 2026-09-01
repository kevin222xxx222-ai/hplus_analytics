export type LifecycleReviewInput = { castId: string; displayName: string; status: string; endedOn: Date | null; mergedIntoCastId: string | null; currentMembershipCount: number; currentAliasCount: number; currentListingCount: number; currentDatasetEvidence: boolean; duplicateOrMerge: boolean };
export function classifyGlobalLifecycleReview(input: LifecycleReviewInput) {
  const marker = /退店|休業/.test(input.displayName);
  if (input.mergedIntoCastId && input.currentMembershipCount > 0) return { classification: "DUPLICATE_OR_MERGE_REVIEW", candidateForGlobalInactive: false, plannedAction: "CLOSE_MERGED_CURRENT_MEMBERSHIP" } as const;
  if (input.currentMembershipCount === 0 && input.status === "ACTIVE") {
    if (input.duplicateOrMerge) return { classification: "DUPLICATE_OR_MERGE_REVIEW", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
    if (input.currentAliasCount > 0 || input.currentListingCount > 0 || input.currentDatasetEvidence) return { classification: "CURRENT_MEDIA_CONFLICT", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
    if (marker) return { classification: "RETIRED_MARKER_CONFIRMED", candidateForGlobalInactive: true, plannedAction: "SET_CAST_INACTIVE" } as const;
    return { classification: "NO_CURRENT_EVIDENCE", candidateForGlobalInactive: true, plannedAction: "SET_CAST_INACTIVE" } as const;
  }
  return { classification: "MEMBERSHIP_COVERAGE_UNCERTAIN", candidateForGlobalInactive: false, plannedAction: "REVIEW_REQUIRED" } as const;
}
