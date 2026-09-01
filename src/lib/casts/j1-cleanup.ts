export type J1Input = { status: string; merged: boolean; memberships: number; aliases: number; listings: number; townCurrent: boolean; hasEndedOn: boolean; marker: boolean };
export function classifyJ1(input: J1Input) {
  if (input.merged) return { classification: "MERGE_OR_DUPLICATE_RELATED", applyEligible: false } as const;
  if (input.memberships === 0 && input.aliases === 0 && input.listings === 0 && !input.townCurrent && input.status === "ACTIVE") return { classification: "SAFE_GLOBAL_INACTIVE_CANDIDATE", applyEligible: false } as const;
  if (input.memberships === 0 && input.status === "ACTIVE") {
    if (input.townCurrent) return { classification: "MEMBERSHIP_DATA_GAP_CONFIRMED", applyEligible: false } as const;
    if (input.aliases > 0 && input.listings > 0) return { classification: "STALE_ALIAS_AND_LISTING", applyEligible: false } as const;
    if (input.aliases > 0) return { classification: "STALE_ALIAS_ONLY", applyEligible: false } as const;
    if (input.listings > 0) return { classification: "STALE_LISTING_ONLY", applyEligible: false } as const;
    return { classification: "CURRENT_EVIDENCE_CONFLICT", applyEligible: false } as const;
  }
  return { classification: "REVIEW_REQUIRED", applyEligible: false } as const;
}
