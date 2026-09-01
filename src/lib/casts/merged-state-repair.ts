export type CurrentMembership = { id: string; storeId: string; status: string; joinedAt: Date | null; leftAt: Date | null; source: string | null; sourceConfidence: string | null; store: { shortName: string } };
export type CurrentListing = { id: string; storeId: string; mediaType: string; listedFrom: Date | null; listedTo: Date | null; isListed: boolean; store: { shortName: string } };

export function planMergedStateRepair(sourceMemberships: CurrentMembership[], targetMemberships: CurrentMembership[], sourceListings: CurrentListing[], targetListings: CurrentListing[]) {
  const currentMembership = (row: CurrentMembership) => row.status === "ACTIVE" || row.status === "ON_LEAVE";
  const currentListing = (row: CurrentListing) => row.isListed;
  const membershipPairs = sourceMemberships.filter(currentMembership).map((source) => {
    const targetEquivalent = targetMemberships.find((target) => target.storeId === source.storeId && currentMembership(target)) ?? null;
    return { sourceMembership: source, targetEquivalentMembership: targetEquivalent, safeToCloseSource: Boolean(targetEquivalent), action: targetEquivalent ? "CLOSE_SOURCE_CURRENT_MEMBERSHIP" : "REVIEW_TARGET_MEMBERSHIP_MISSING" } as const;
  });
  const listingPairs = sourceListings.filter(currentListing).map((source) => {
    const targetEquivalent = targetListings.find((target) => target.storeId === source.storeId && target.mediaType === source.mediaType && currentListing(target)) ?? null;
    return { sourceListing: source, targetEquivalentListing: targetEquivalent, safeToCloseSource: Boolean(targetEquivalent), action: targetEquivalent ? "CLOSE_SOURCE_CURRENT_LISTING" : "REVIEW_TARGET_LISTING_MISSING" } as const;
  });
  return { membershipPairs, listingPairs, safeMembershipClosures: membershipPairs.filter((p) => p.safeToCloseSource), membershipReviews: membershipPairs.filter((p) => !p.safeToCloseSource), safeListingClosures: listingPairs.filter((p) => p.safeToCloseSource), listingReviews: listingPairs.filter((p) => !p.safeToCloseSource) };
}
