export function isMergedP0Source(input: { mergedIntoCastId: string | null; currentMembershipCount: number; currentListingCount: number }) {
  return Boolean(input.mergedIntoCastId) && (input.currentMembershipCount > 0 || input.currentListingCount > 0);
}

export function validateMergedCleanupCandidate(input: { mergedIntoCastId: string | null; sourceMembershipCount: number; sourceListingCount: number; targetHasEquivalentMembership: boolean; targetHasEquivalentListing: boolean; targetHasLeftMembership: boolean; targetMembershipCreateCandidate?: boolean; mergedAt: Date | null }) {
  const reasons: string[] = [];
  if (!input.mergedIntoCastId) reasons.push("SOURCE_NOT_MERGED");
  if (input.sourceMembershipCount === 0 && input.sourceListingCount === 0) reasons.push("SOURCE_ALREADY_CLEAN");
  if (input.targetHasLeftMembership) reasons.push("TARGET_LEFT_MEMBERSHIP_REQUIRES_REENTRY");
  if (input.sourceMembershipCount > 0 && !input.targetHasEquivalentMembership && !input.targetMembershipCreateCandidate) reasons.push("TARGET_MEMBERSHIP_MISSING");
  if (input.sourceListingCount > 0 && !input.targetHasEquivalentListing) reasons.push("TARGET_LISTING_MISSING");
  if (!input.mergedAt) reasons.push("MERGED_AT_REQUIRED");
  return { applyEligible: reasons.length === 0, blockReasons: reasons };
}
