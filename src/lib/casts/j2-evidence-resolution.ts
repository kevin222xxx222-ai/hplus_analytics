export type J2Input = { j1Classification: string; marker: boolean; townCurrent: boolean; currentAliases: number; currentListings: number; hasMembership: boolean; duplicate: boolean; townLastSeen: Date | null; townFirstAbsent: Date | null };
export function classifyJ2(input: J2Input) {
  if (input.duplicate) return "DUPLICATE_OR_ALIAS_COLLISION" as const;
  if (input.marker && input.townCurrent) return "RETIRED_MARKER_CONFLICT" as const;
  if (input.townCurrent && !input.hasMembership && !input.marker) return "POSSIBLE_MEMBERSHIP_GAP" as const;
  if (input.marker && !input.townCurrent) return input.townLastSeen && input.townFirstAbsent ? "RETIRED_MARKER_SUPPORTED" as const : "INSUFFICIENT_EVIDENCE" as const;
  if (!input.townCurrent && (input.currentAliases > 0 || input.currentListings > 0)) return "CURRENT_EVIDENCE_STALE_MEDIA_ONLY" as const;
  if (input.townLastSeen && input.townFirstAbsent) return "CLOSE_DATE_RANGE_CONFIRMED" as const;
  return "INSUFFICIENT_EVIDENCE" as const;
}
