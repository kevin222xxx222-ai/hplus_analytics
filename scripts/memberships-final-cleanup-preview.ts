import { prisma } from "@/lib/prisma";
import { isMergedP0Source } from "@/lib/casts/final-cleanup-guard";

async function main() {
  const casts = await prisma.cast.findMany({ where: { mergedIntoCastId: null }, select: { id: true, displayName: true, status: true, endedOn: true, memberships: { select: { status: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true } }, mediaListings: { where: { isListed: true }, select: { id: true } } } });
  const safeInactive = casts.filter((c) => c.status === "ACTIVE" && c.memberships.length === 0 && c.aliases.length === 0 && c.mediaListings.length === 0);
  const mediaConflict = casts.filter((c) => c.status === "ACTIVE" && c.memberships.length === 0 && (c.aliases.length > 0 || c.mediaListings.length > 0));
  const merged = await prisma.cast.findMany({
    where: { mergedIntoCastId: { not: null } },
    select: {
      id: true,
      displayName: true,
      mergedIntoCastId: true,
      mergedAt: true,
      memberships: {
        where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
        select: { id: true, storeId: true, status: true, joinedAt: true, leftAt: true, source: true, sourceConfidence: true },
      },
      mediaListings: {
        where: { isListed: true },
        select: { id: true, storeId: true, mediaType: true, listedFrom: true, listedTo: true },
      },
    },
  });
  const mergedP0 = merged.filter((row) => isMergedP0Source({ mergedIntoCastId: row.mergedIntoCastId, currentMembershipCount: row.memberships.length, currentListingCount: row.mediaListings.length })).map((row) => ({ ...row, applyEligible: row.id === "a9a779a0-328c-4c30-aca3-e715b0d79e1a", classification: row.id === "a9a779a0-328c-4c30-aca3-e715b0d79e1a" ? "TARGET_MEMBERSHIP_DATA_GAP_CONFIRMED" : "MERGED_SOURCE_CURRENT_STATE", closeDate: row.mergedAt?.toISOString().slice(0, 10) ?? null }));
  console.log(JSON.stringify({ readOnly: true, audit: "MEMBERSHIP_FINAL_CLEANUP_PREVIEW", mergedSourcesTotal: merged.length, mergedSourceClean: merged.filter((row) => row.memberships.length === 0 && row.mediaListings.length === 0).length, mergedP0: mergedP0.length, mergedP0Details: mergedP0, safeInactiveCandidates: safeInactive.length, currentMediaConflict: mediaConflict.length, applyEligibleMergedRepairs: mergedP0.filter((row) => row.applyEligible).length, productionApply: false }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
