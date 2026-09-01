export type J1Input = { status: string; merged: boolean; memberships: number; aliases: number; listings: number; townCurrent: boolean; hasEndedOn: boolean; marker: boolean };
export function classifyJ1(input: J1Input) {
  if (input.merged) return { classification: "MERGE_OR_DUPLICATE_RELATED", applyEligible: false, plannedAction: "NO_ACTION", blockReason: "MERGED_CAST_REQUIRES_DEDICATED_FLOW" } as const;
  if (input.memberships === 0 && input.aliases === 0 && input.listings === 0 && !input.townCurrent && input.status === "ACTIVE") return { classification: "SAFE_GLOBAL_INACTIVE_CANDIDATE", applyEligible: true, plannedAction: "SET_CAST_INACTIVE_STATUS_ONLY", blockReason: null } as const;
  if (input.memberships === 0 && input.status === "ACTIVE") {
    if (input.marker && (input.townCurrent || input.aliases > 0 || input.listings > 0)) return { classification: "RETIRED_MARKER_CURRENT_EVIDENCE_CONFLICT", applyEligible: false, plannedAction: "REVIEW_REQUIRED", blockReason: "RETIRED_MARKER" } as const;
    if (input.townCurrent) return { classification: "MEMBERSHIP_DATA_GAP_CONFIRMED", applyEligible: false, plannedAction: "CREATE_MEMBERSHIP_REVIEW", blockReason: "HUMAN_CONFIRM_REQUIRED" } as const;
    if (input.aliases > 0 && input.listings > 0) return { classification: "STALE_ALIAS_AND_LISTING", applyEligible: false, plannedAction: "REVIEW_REQUIRED", blockReason: "MISSING_CONFIRMED_CLOSE_DATE" } as const;
    if (input.aliases > 0) return { classification: "STALE_ALIAS_ONLY", applyEligible: false, plannedAction: "REVIEW_REQUIRED", blockReason: "MISSING_CONFIRMED_CLOSE_DATE" } as const;
    if (input.listings > 0) return { classification: "STALE_LISTING_ONLY", applyEligible: false, plannedAction: "REVIEW_REQUIRED", blockReason: "MISSING_CONFIRMED_CLOSE_DATE" } as const;
    return { classification: "CURRENT_EVIDENCE_CONFLICT", applyEligible: false, plannedAction: "REVIEW_REQUIRED", blockReason: "UNCLASSIFIED_CURRENT_EVIDENCE" } as const;
  }
  return { classification: "REVIEW_REQUIRED", applyEligible: false, plannedAction: "REVIEW_REQUIRED", blockReason: "OUTSIDE_J1_SCOPE" } as const;
}
