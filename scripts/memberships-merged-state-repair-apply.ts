import { prisma } from "@/lib/prisma";
import { planMergedStateRepair } from "@/lib/casts/merged-state-repair";

function option(name: string) { return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  const sourceCastId = option("--source-cast-id");
  if (option("--confirm") !== "CONFIRM" || process.env.MEMBERSHIP_MERGED_REPAIR_ENABLED !== "true") {
    console.log("Preview only. Apply requires --confirm=CONFIRM and MEMBERSHIP_MERGED_REPAIR_ENABLED=true.");
    return;
  }
  if (!sourceCastId) throw new Error("--source-cast-id=<UUID> is required; bulk apply is disabled.");
  const closeDate = option("--close-date");
  if (!closeDate || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) throw new Error("--close-date=YYYY-MM-DD is required; historical close dates are never inferred.");
  const sources = await prisma.cast.findMany({
    where: { mergedIntoCastId: { not: null }, id: sourceCastId },
    include: {
      memberships: { where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, include: { store: { select: { shortName: true } } } },
      mediaListings: { where: { isListed: true }, include: { store: { select: { shortName: true } } } },
      mergedInto: {
        include: {
          memberships: { where: { status: { in: ["ACTIVE", "ON_LEAVE"] } }, include: { store: { select: { shortName: true } } } },
          mediaListings: { where: { isListed: true }, include: { store: { select: { shortName: true } } } },
        },
      },
    },
  });
  if (sources.length !== 1) throw new Error("指定されたmerged sourceが見つかりません。");
  await prisma.$transaction(async (tx) => {
    for (const source of sources) {
      if (!source.mergedInto) continue;
      const lockIds = [source.id, source.mergedInto.id].sort();
      for (const id of lockIds) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`merged-state-repair:${id}`})) IS NULL AS locked`;
      const plan = planMergedStateRepair(source.memberships, source.mergedInto.memberships, source.mediaListings, source.mergedInto.mediaListings);
      if (plan.membershipReviews.length || plan.listingReviews.length) throw new Error("対象pairはfullySafeではありません。partial applyは許可されていません。");
      const closeAt = new Date(`${closeDate}T00:00:00.000Z`);
      if (source.mergedAt && source.mergedAt.toISOString().slice(0, 10) !== closeDate) throw new Error("close-dateはsource.mergedAtと一致させてください。");
      for (const item of plan.safeMembershipClosures) {
        if (item.sourceMembership.joinedAt && item.sourceMembership.joinedAt > closeAt) throw new Error(`Membership ${item.sourceMembership.id} のjoinedAtがclose日より後です。`);
        await tx.castStoreMembership.update({ where: { id: item.sourceMembership.id }, data: { status: "LEFT", leftAt: closeAt } });
      }
      if (plan.safeListingClosures.length) {
        const listings = await tx.mediaListing.findMany({ where: { id: { in: plan.safeListingClosures.map((item) => item.sourceListing.id) } } });
        for (const listing of listings) {
          if (listing.listedFrom && listing.listedFrom > closeAt) throw new Error(`Listing ${listing.id} の開始日が指定close日より後です。Previewを再確認してください。`);
          await tx.mediaListingHistory.create({ data: { castId: source.id, storeId: listing.storeId, mediaType: listing.mediaType, listedFrom: listing.listedFrom, listedTo: closeAt, source: "MERGED_STATE_REPAIR" } });
        }
        await tx.mediaListing.updateMany({ where: { id: { in: plan.safeListingClosures.map((item) => item.sourceListing.id) }, isListed: true }, data: { isListed: false, listedTo: closeAt } });
      }
    }
  }, { isolationLevel: "Serializable" });
  console.log("Merged state repair completed.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
