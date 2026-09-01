import { prisma } from "@/lib/prisma";
import { planMergedStateRepair } from "@/lib/casts/merged-state-repair";

async function main() {
  const sourceCastId = process.argv.find((arg) => arg.startsWith("--source-cast-id="))?.split("=")[1];
  const sources = await prisma.cast.findMany({
    where: { mergedIntoCastId: { not: null }, ...(sourceCastId ? { id: sourceCastId } : {}) },
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
  const rows = sources.filter((source) => source.mergedInto).map((source) => {
    const target = source.mergedInto!;
    const plan = planMergedStateRepair(source.memberships, target.memberships, source.mediaListings, target.mediaListings);
    const requestedCloseDate = source.mergedAt ? source.mergedAt.toISOString().slice(0, 10) : null;
    const dateValidation = requestedCloseDate ? { status: "VALIDATED_FROM_MERGED_AT", date: requestedCloseDate } : { status: "HUMAN_CLOSE_DATE_REQUIRED", date: null };
    return { sourceCast: { id: source.id, displayName: source.displayName, status: source.status, mergedIntoCastId: source.mergedIntoCastId, mergedAt: source.mergedAt, createdAt: source.createdAt, updatedAt: source.updatedAt }, targetCast: target, requestedCloseDate, dateValidation, ...plan, fullySafe: plan.membershipReviews.length === 0 && plan.listingReviews.length === 0, repair: { sourceMemberships: plan.safeMembershipClosures.map((item) => item.sourceMembership.id), sourceListings: plan.safeListingClosures.map((item) => item.sourceListing.id) } };
  });
  const p0 = rows.filter((row) => row.membershipPairs.length || row.listingPairs.length);
  const summary = { targets: p0.length, safeMembershipClosures: p0.reduce((n, r) => n + r.safeMembershipClosures.length, 0), membershipReviews: p0.reduce((n, r) => n + r.membershipReviews.length, 0), safeListingClosures: p0.reduce((n, r) => n + r.safeListingClosures.length, 0), listingReviews: p0.reduce((n, r) => n + r.listingReviews.length, 0), fullySafePairs: p0.filter((r) => r.fullySafe).length, reviewRequiredPairs: p0.filter((r) => !r.fullySafe).length };
  console.log(JSON.stringify({ readOnly: true, audit: "MERGED_STATE_REPAIR_PREVIEW", summary, pairs: p0 }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
