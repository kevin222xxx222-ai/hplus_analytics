import { prisma } from "@/lib/prisma";
import { planMergedStateRepair } from "@/lib/casts/merged-state-repair";

function option(name: string) { return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  if (option("--confirm") !== "CONFIRM" || process.env.MEMBERSHIP_MERGED_REPAIR_ENABLED !== "true") {
    console.log("Preview only. Apply requires --confirm=CONFIRM and MEMBERSHIP_MERGED_REPAIR_ENABLED=true.");
    return;
  }
  const closeDate = option("--close-date");
  if (!closeDate || !/^\d{4}-\d{2}-\d{2}$/.test(closeDate)) throw new Error("--close-date=YYYY-MM-DD is required; historical close dates are never inferred.");
  const sources = await prisma.cast.findMany({
    where: { mergedIntoCastId: { not: null } },
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
  await prisma.$transaction(async (tx) => {
    for (const source of sources) {
      if (!source.mergedInto) continue;
      const lockIds = [source.id, source.mergedInto.id].sort();
      for (const id of lockIds) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`merged-state-repair:${id}`})) IS NULL AS locked`;
      const plan = planMergedStateRepair(source.memberships, source.mergedInto.memberships, source.mediaListings, source.mergedInto.mediaListings);
      for (const item of plan.safeMembershipClosures) await tx.castStoreMembership.update({ where: { id: item.sourceMembership.id }, data: { status: "LEFT", leftAt: new Date(`${closeDate}T00:00:00.000Z`) } });
      if (plan.safeListingClosures.length) {
        const listings = await tx.mediaListing.findMany({ where: { id: { in: plan.safeListingClosures.map((item) => item.sourceListing.id) } } });
        for (const listing of listings) {
          if (listing.listedFrom && listing.listedFrom > new Date(`${closeDate}T00:00:00.000Z`)) throw new Error(`Listing ${listing.id} の開始日が指定close日より後です。Previewを再確認してください。`);
          await tx.mediaListingHistory.create({ data: { castId: source.id, storeId: listing.storeId, mediaType: listing.mediaType, listedFrom: listing.listedFrom, listedTo: new Date(`${closeDate}T00:00:00.000Z`), source: "MERGED_STATE_REPAIR" } });
        }
        await tx.mediaListing.updateMany({ where: { id: { in: plan.safeListingClosures.map((item) => item.sourceListing.id) }, isListed: true }, data: { isListed: false, listedTo: new Date(`${closeDate}T00:00:00.000Z`) } });
      }
    }
  }, { isolationLevel: "Serializable" });
  console.log("Merged state repair completed.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
