import { prisma } from "@/lib/prisma";
import { classifyJ1 } from "@/lib/casts/j1-cleanup";
async function main() {
  const [casts, town] = await Promise.all([
    prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, endedOn: true, mergedIntoCastId: true, memberships: { where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true } }, mediaListings: { where: { isListed: true }, select: { id: true } } } }),
    prisma.townCastDaily.findMany({ where: { importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { castId: true, date: true } }),
  ]);
  const latest = town.reduce<Date | null>((v, r) => !v || r.date > v ? r.date : v, null);
  const currentTown = new Set(town.filter((r) => latest && r.date.getTime() === latest.getTime()).map((r) => r.castId));
  const details = casts.map((cast) => ({ castId: cast.id, displayName: cast.displayName, legacyStatus: cast.status, endedOn: cast.endedOn, currentMembershipCount: cast.memberships.length, currentAliasCount: cast.aliases.length, currentListingCount: cast.mediaListings.length, townCurrent: currentTown.has(cast.id), ...classifyJ1({ status: cast.status, merged: Boolean(cast.mergedIntoCastId), memberships: cast.memberships.length, aliases: cast.aliases.length, listings: cast.mediaListings.length, townCurrent: currentTown.has(cast.id), hasEndedOn: Boolean(cast.endedOn), marker: /退店|休業/u.test(cast.displayName) }) }));
  const count = (name: string) => details.filter((row) => row.classification === name).length;
  console.log(JSON.stringify({ readOnly: true, audit: "J1_LEGACY_CLEANUP_PREVIEW", mediaConflictTotal: details.filter((r) => ["MEMBERSHIP_DATA_GAP_CONFIRMED", "STALE_ALIAS_ONLY", "STALE_LISTING_ONLY", "STALE_ALIAS_AND_LISTING", "CURRENT_EVIDENCE_CONFLICT"].includes(r.classification)).length, membershipGapConfirmed: count("MEMBERSHIP_DATA_GAP_CONFIRMED"), staleAliasOnly: count("STALE_ALIAS_ONLY"), staleListingOnly: count("STALE_LISTING_ONLY"), staleAliasAndListing: count("STALE_ALIAS_AND_LISTING"), currentEvidenceConflict: count("CURRENT_EVIDENCE_CONFLICT"), mergeOrDuplicateRelated: count("MERGE_OR_DUPLICATE_RELATED"), reviewRequired: count("REVIEW_REQUIRED"), safeInactiveTotal: count("SAFE_GLOBAL_INACTIVE_CANDIDATE"), safeInactiveConfirmed: 0, applyEligibleRepairs: 0, details }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
