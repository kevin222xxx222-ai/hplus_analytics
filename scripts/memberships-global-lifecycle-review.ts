import { prisma } from "@/lib/prisma";
import { classifyGlobalLifecycleReview, classifyMergedResources } from "@/lib/casts/global-lifecycle-review";
async function main() {
  const [casts, townRows] = await Promise.all([
    prisma.cast.findMany({ select: { id: true, displayName: true, status: true, endedOn: true, mergedIntoCastId: true, memberships: { select: { status: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true } }, mediaListings: { where: { isListed: true }, select: { id: true } }, mergedInto: { select: { id: true, displayName: true, status: true, memberships: { select: { status: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true } }, mediaListings: { where: { isListed: true }, select: { id: true } } } } } }),
    prisma.townCastDaily.findMany({ where: { importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, select: { castId: true, date: true } }),
  ]);
  const latestTown = townRows.reduce<Date | null>((latest, row) => !latest || row.date > latest ? row.date : latest, null);
  const townCurrent = new Set(townRows.filter((row) => latestTown && row.date.getTime() === latestTown.getTime()).map((row) => row.castId));
  const rows = casts.map((cast) => {
    const currentMembershipCount = cast.memberships.filter((m) => m.status === "ACTIVE" || m.status === "ON_LEAVE").length;
    const review = classifyGlobalLifecycleReview({
      castId: cast.id,
      displayName: cast.displayName,
      status: cast.status,
      endedOn: cast.endedOn,
      mergedIntoCastId: cast.mergedIntoCastId,
      currentMembershipCount,
      currentAliasCount: cast.aliases.length,
      currentListingCount: cast.mediaListings.length,
      currentDatasetEvidence: townCurrent.has(cast.id),
      duplicateOrMerge: Boolean(cast.mergedIntoCastId),
    });
    const mergedPair = cast.mergedInto ? {
      source: { castId: cast.id, displayName: cast.displayName, status: cast.status, mergedIntoCastId: cast.mergedIntoCastId, memberships: cast.memberships, aliases: cast.aliases, mediaListings: cast.mediaListings },
      target: cast.mergedInto,
      resources: classifyMergedResources({
        sourceMembershipCurrent: currentMembershipCount > 0,
        targetMembershipCurrent: cast.mergedInto.memberships.some((m) => m.status === "ACTIVE" || m.status === "ON_LEAVE"),
        sourceListingCurrent: cast.mediaListings.length > 0,
        targetListingCurrent: cast.mergedInto.mediaListings.length > 0,
      }),
    } : null;
    return { ...cast, currentMembershipCount, ...review, mergedPair };
  });
  const reviewRows = rows.filter((row) => row.classification !== "NOT_REVIEW_TARGET");
  const counts = reviewRows.reduce<Record<string, number>>((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {});
  const mergedSourceClean = rows.filter((row) => row.classification === "MERGED_SOURCE_CLEAN");
  const mergedP0 = rows.filter((row) => row.classification.startsWith("MERGED_SOURCE_CURRENT_"));
  const allLeftActiveCandidates = rows.filter((row) => row.mergedIntoCastId === null && row.status === "ACTIVE" && row.currentMembershipCount === 0);
  const safeInactiveCandidates = reviewRows.filter((row) => row.candidateForGlobalInactive);
  const reviewRequired = reviewRows.filter((row) => row.plannedAction === "REVIEW_REQUIRED");
  console.log(JSON.stringify({ readOnly: true, audit: "GLOBAL_LIFECYCLE_REVIEW", reviewUniverse: reviewRows.length, allLeftActiveCandidates: allLeftActiveCandidates.length, mergedCurrentStateCandidates: mergedP0.length, totalCandidates: reviewRows.length, counts, safeInactiveCandidates: safeInactiveCandidates.length, reviewRequired: reviewRequired.length, mergedSourceClean: mergedSourceClean.length, mergedP0: mergedP0.length, mergedPairs: mergedP0.map((row) => row.mergedPair), primaryStoreExpectedDifference: "DISPLAY_ONLY_LEGACY", details: reviewRows }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
