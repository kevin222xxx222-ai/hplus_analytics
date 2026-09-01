import { prisma } from "@/lib/prisma";
import { classifyTargetMembershipReview } from "@/lib/casts/merged-target-membership-review";

function option(name: string) { return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  const sourceCastId = option("--source-cast-id");
  if (!sourceCastId) throw new Error("--source-cast-id=<UUID> is required.");
  const source = await prisma.cast.findUnique({ where: { id: sourceCastId }, include: { mergedInto: true, memberships: { include: { store: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, include: { store: true } }, mediaListings: { where: { isListed: true }, include: { store: true } } } });
  if (!source?.mergedInto) throw new Error("merged sourceまたはtargetが見つかりません。");
  const targetId = source.mergedInto.id;
  const storeIds = [...new Set(source.memberships.map((m) => m.storeId))];
  const [target, townRows, ctiRows] = await Promise.all([
    prisma.cast.findUniqueOrThrow({ where: { id: targetId }, include: { memberships: { include: { store: true } }, aliases: { where: { validTo: null, reviewStatus: { not: "IGNORED" } }, include: { store: true } }, mediaListings: { where: { isListed: true }, include: { store: true } } } }),
    prisma.townCastDaily.findMany({ where: { castId: { in: [source.id, targetId] }, storeId: { in: storeIds }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, orderBy: { date: "desc" }, select: { castId: true, storeId: true, date: true, sourceCastName: true, importBatchId: true } }),
    prisma.ctiCastDaily.findMany({ where: { castId: { in: [source.id, targetId] }, storeId: { in: storeIds }, importBatch: { status: { in: ["COMPLETED", "COMPLETED_WITH_WARNINGS"] } } }, orderBy: { businessDate: "desc" }, select: { castId: true, storeId: true, businessDate: true, importBatchId: true } }),
  ]);
  const stores = storeIds.map((storeId) => {
    const sourceMemberships = source.memberships.filter((m) => m.storeId === storeId);
    const targetMemberships = target.memberships.filter((m) => m.storeId === storeId);
    const latestTownDate = townRows.find((r) => r.storeId === storeId)?.date ?? null;
    const latestCtiDate = ctiRows.find((r) => r.storeId === storeId)?.businessDate ?? null;
    const townCurrent = townRows.some((r) => r.castId === targetId && r.storeId === storeId && latestTownDate && r.date.getTime() === latestTownDate.getTime());
    const ctiCurrent = ctiRows.some((r) => r.castId === targetId && r.storeId === storeId && latestCtiDate && r.businessDate.getTime() === latestCtiDate.getTime());
    const targetAlias = target.aliases.filter((a) => a.storeId === storeId);
    const targetListing = target.mediaListings.filter((l) => l.storeId === storeId);
    return { storeId, storeName: source.memberships.find((m) => m.storeId === storeId)?.store.shortName ?? null, sourceMemberships, targetMemberships, targetAliases: targetAlias, targetListings: targetListing, latestTown: townRows.find((r) => r.storeId === storeId) ?? null, latestCti: ctiRows.find((r) => r.storeId === storeId) ?? null, classification: classifyTargetMembershipReview({ targetMembershipStatuses: targetMemberships.map((m) => m.status), targetCurrentAlias: targetAlias.length > 0, targetCurrentListing: targetListing.length > 0, targetTownCurrent: townCurrent, sourceStoreEvidence: sourceMemberships.length > 0 }), targetTownCurrent: townCurrent, targetCtiCurrent: ctiCurrent };
  });
  console.log(JSON.stringify({ readOnly: true, audit: "MERGED_TARGET_MEMBERSHIP_REVIEW", source: { id: source.id, displayName: source.displayName, status: source.status, mergedAt: source.mergedAt, memberships: source.memberships, aliases: source.aliases, mediaListings: source.mediaListings }, target: { id: target.id, displayName: target.displayName, status: target.status, memberships: target.memberships, aliases: target.aliases, mediaListings: target.mediaListings }, stores, plannedActions: stores.map((row) => row.classification.targetMembershipCreateCandidate ? "REVIEW_ONLY_TARGET_MEMBERSHIP_CREATE_THEN_SOURCE_CLOSE" : "NO_AUTO_ACTION"), apply: false }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
