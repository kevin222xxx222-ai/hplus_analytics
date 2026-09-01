import { prisma } from "@/lib/prisma";

function option(name: string) { return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  if (option("--confirm") !== "CONFIRM" || process.env.MEMBERSHIP_FINAL_CLEANUP_ENABLED !== "true") { console.log("Preview only. Apply requires --confirm=CONFIRM and MEMBERSHIP_FINAL_CLEANUP_ENABLED=true."); return; }
  const sourceCastId = option("--source-cast-id");
  if (!sourceCastId) throw new Error("--source-cast-id is required; bulk cleanup is disabled.");
  await prisma.$transaction(async (tx) => {
    const source = await tx.cast.findUnique({ where: { id: sourceCastId }, include: { mergedInto: true, memberships: { where: { status: { in: ["ACTIVE", "ON_LEAVE"] } } }, mediaListings: { where: { isListed: true } } } });
    if (!source?.mergedInto || !source.mergedAt) throw new Error("merged source/targetまたは確定mergedAtがありません。");
    const target = await tx.cast.findUniqueOrThrow({ where: { id: source.mergedInto.id }, include: { memberships: true } });
    for (const id of [source.id, target.id].sort()) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`final-cleanup:${id}`})) IS NULL AS locked`;
    const storeIds = [...new Set(source.memberships.map((m) => m.storeId))];
    for (const storeId of storeIds) {
      if (target.memberships.some((m) => m.storeId === storeId && (m.status === "ACTIVE" || m.status === "ON_LEAVE"))) continue;
      if (target.memberships.some((m) => m.storeId === storeId && m.status === "LEFT")) throw new Error("targetにLEFT Membershipがあるため自動再入店を行いません。");
      await tx.castStoreMembership.create({ data: { castId: target.id, storeId, status: "ACTIVE", joinedAt: null, leftAt: null, source: "MERGE_REPAIR", sourceConfidence: "CONFIRMED", note: `merged source ${source.id} のcurrent state引継ぎ` } });
    }
    const closeAt = new Date(source.mergedAt.toISOString().slice(0, 10));
    await tx.castStoreMembership.updateMany({ where: { id: { in: source.memberships.map((m) => m.id) }, status: { in: ["ACTIVE", "ON_LEAVE"] } }, data: { status: "LEFT", leftAt: closeAt } });
    for (const listing of source.mediaListings) {
      if (listing.listedFrom && listing.listedFrom > closeAt) throw new Error(`Listing ${listing.id} の開始日がmergedAtより後です。`);
      await tx.mediaListingHistory.create({ data: { castId: source.id, storeId: listing.storeId, mediaType: listing.mediaType, listedFrom: listing.listedFrom, listedTo: closeAt, source: "MERGE_REPAIR" } });
      await tx.mediaListing.update({ where: { id: listing.id }, data: { isListed: false, listedTo: closeAt } });
    }
  }, { isolationLevel: "Serializable" });
  console.log("Final cleanup completed.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
