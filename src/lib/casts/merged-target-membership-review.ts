export type TargetMembershipReviewInput = {
  targetMembershipStatuses: string[];
  targetCurrentAlias: boolean;
  targetCurrentListing: boolean;
  targetTownCurrent: boolean;
  sourceStoreEvidence: boolean;
};

export function classifyTargetMembershipReview(input: TargetMembershipReviewInput) {
  if (input.targetMembershipStatuses.includes("ACTIVE") || input.targetMembershipStatuses.includes("ON_LEAVE")) return { classification: "NO_MEMBERSHIP_CREATE_NEEDED", targetMembershipCreateCandidate: false, reason: "TARGET_CURRENT_MEMBERSHIP_EXISTS" } as const;
  if (input.targetMembershipStatuses.includes("LEFT")) return { classification: "TARGET_MEMBERSHIP_EVIDENCE_INSUFFICIENT", targetMembershipCreateCandidate: false, reason: "TARGET_LEFT_MEMBERSHIP_REQUIRES_REENTRY_REVIEW" } as const;
  if (input.targetCurrentAlias && input.targetCurrentListing && input.targetTownCurrent && input.sourceStoreEvidence) return { classification: "TARGET_MEMBERSHIP_DATA_GAP_CONFIRMED", targetMembershipCreateCandidate: true, reason: "CURRENT_STORE_EVIDENCE_AND_MERGE_IDENTITY" } as const;
  if (input.targetCurrentAlias || input.targetCurrentListing || input.targetTownCurrent) return { classification: "TARGET_MEMBERSHIP_EVIDENCE_INSUFFICIENT", targetMembershipCreateCandidate: false, reason: "CURRENT_EVIDENCE_NOT_STRONG_ENOUGH" } as const;
  return { classification: "OTHER_REVIEW", targetMembershipCreateCandidate: false, reason: "NO_CURRENT_STORE_EVIDENCE" } as const;
}
