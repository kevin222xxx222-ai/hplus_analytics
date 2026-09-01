import { prisma } from "@/lib/prisma";
import { classifyGlobalLifecycleReview } from "@/lib/casts/global-lifecycle-review";
async function main() {
  const [casts, townRows] = await Promise.all([
    prisma.cast.findMany({ select: { id: true, displayName: true, status: true, endedOn: true, mergedIntoCastId: true, memberships: { select: { status: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, select: { id: true } }, mediaListings: { where: { isListed: true }, select: { id: true } } } }),
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
    return { ...cast, currentMembershipCount, ...review };
  });
  const counts = rows.reduce<Record<string, number>>((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {});
  console.log(JSON.stringify({ readOnly: true, audit: "GLOBAL_LIFECYCLE_REVIEW", totalCandidates: rows.length, counts, mergedCurrentMembership: rows.filter((row) => row.mergedIntoCastId && row.currentMembershipCount > 0), primaryStoreExpectedDifference: "DISPLAY_ONLY_LEGACY", details: rows }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
