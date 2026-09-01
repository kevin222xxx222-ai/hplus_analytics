import { prisma } from "@/lib/prisma";

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
  console.log(JSON.stringify({ readOnly: true, audit: "MEMBERSHIP_FINAL_CLEANUP_PREVIEW", mergedP0: merged, safeInactive: { count: safeInactive.length, details: safeInactive }, mediaConflict: { count: mediaConflict.length, details: mediaConflict }, productionApply: false }, null, 2));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
